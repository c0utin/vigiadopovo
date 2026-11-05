//! Medallion lake of the Câmara's votes in Cloudflare R2, append-only.
//!
//!   cargo run --release                     # current year (and previous in January)
//!   cargo run --release -- 2019 2020        # backfill
//!   cargo run --release -- --out .lake 2019 # local Parquet, no Cloudflare
//!
//! Bronze: each official file, as published, stored once under its SHA-256
//! (`bronze/camara/<nome>/<ano>/<sha256>.json.gz`), and `bronze.arquivos`, one
//! row per file per batch with its hash and published field list.
//! Silver (`prata.*`): typed records as append-only SCD type 2 (see scd.rs).
//! Gold (`ouro.*`): the published aggregates of each batch (see ouro.rs).
//!
//! A batch (`lote`) is the SHA-256 of a year's four "arquivo:sha256" lines.
//! A year whose latest batch already has these files is skipped without
//! parsing or writing. Tables are committed one by one and `bronze.arquivos`
//! last, so a batch listed there is complete; rerunning after a failure
//! appends only what is missing. Needs CLOUDFLARE_ACCOUNT_ID, LAKE_TOKEN (R2
//! Data Catalog write) and R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY
//! (bronze and data files) unless --out is given. Optional LAKE_BUCKET.

mod camara;
mod lago;
mod ouro;
mod scd;

use std::collections::HashMap;
use std::time::Duration;

use ::iceberg::spec::PrimitiveType::{Int, Long, String as Text, Timestamptz};
use anyhow::{Context, Result, bail};
use chrono::{Datelike, FixedOffset, Utc};
use polars::prelude::*;

use camara::{Missing, Source};
use lago::{Col, Lake, col as c};

const FIRST_YEAR: i32 = 2003;

fn scd_columns(content: &[(&'static str, camara::Kind)]) -> Vec<Col> {
    let mut columns = vec![
        c("ano", Int, true),
        c("chave", Text, true),
        c("hash", Text, false),
        c("operacao", Text, true),
        c("lote", Text, true),
        c("valido_desde", Timestamptz, true),
    ];
    columns.extend(
        content
            .iter()
            .map(|&(name, kind)| c(name, lago::primitive(kind), false)),
    );
    columns
}

fn gold_columns(name: &str) -> Vec<Col> {
    let mut columns = vec![c("ano", Int, true), c("lote", Text, true)];
    columns.extend(match name {
        "alinhamento_bancada" => vec![
            c("bloco", Text, false),
            c("partido", Text, false),
            c("votos", Long, true),
            c("alinhados", Long, true),
        ],
        "deputado_votos" => vec![
            c("deputado_id", Long, true),
            c("orgao", Text, true),
            c("voto", Text, false),
            c("votos", Long, true),
            c("com_orientacao_governo", Long, true),
            c("alinhados_governo", Long, true),
        ],
        "votacoes_mes" => vec![
            c("mes", Int, false),
            c("votacoes", Long, true),
            c("nominais", Long, true),
            c("plenario", Long, true),
        ],
        _ => unreachable!(),
    });
    columns
}

fn file_columns() -> Vec<Col> {
    vec![
        c("ano", Int, true),
        c("lote", Text, true),
        c("arquivo", Text, true),
        c("url", Text, true),
        c("sha256", Text, true),
        c("bytes", Long, true),
        c("campos", Text, true),
        c("objeto", Text, true),
        c("coletado_em", Timestamptz, true),
    ]
}

/// Adds `ano`, `lote` and, for silver, `valido_desde` to a frame.
fn tag(frame: &DataFrame, ano: i32, lote: &str, since: Option<i64>) -> Result<DataFrame> {
    let mut extra = vec![lit(ano).alias("ano"), lit(lote).alias("lote")];
    if let Some(at) = since {
        extra.push(
            lit(at)
                .cast(DataType::Datetime(TimeUnit::Microseconds, None))
                .alias("valido_desde"),
        );
    }
    Ok(frame.clone().lazy().with_columns(extra).collect()?)
}

struct Year {
    ano: i32,
    lote: String,
    sources: Vec<Source>,
    shapes: Vec<String>,
    silver: Vec<(&'static str, DataFrame)>,
    gold: Vec<(&'static str, DataFrame)>,
}

fn build(ano: i32, sources: Vec<Source>) -> Result<Year> {
    let shapes = sources.iter().map(camara::shape).collect::<Result<_>>()?;
    let silver = camara::parse(ano, &sources)?;
    let gold = ouro::compute(&silver)?;
    Ok(Year {
        ano,
        lote: camara::lote(&sources),
        sources,
        shapes,
        silver,
        gold,
    })
}

async fn latest_batch(lake: &Lake, ano: i32) -> Result<Option<String>> {
    let table = lake.table("bronze", "arquivos", &file_columns()).await?;
    let mut latest: Option<(i64, String)> = None;
    for batch in lake.read(&table, ano, &["lote", "coletado_em"]).await? {
        let (lote, at) = (
            lago::strings(&batch, "lote")?,
            batch
                .column_by_name("coletado_em")
                .and_then(|a| {
                    a.as_any()
                        .downcast_ref::<arrow_array::TimestampMicrosecondArray>()
                })
                .context("coletado_em")?,
        );
        for i in 0..batch.num_rows() {
            if latest.as_ref().is_none_or(|(t, _)| at.value(i) > *t) {
                latest = Some((at.value(i), lote.value(i).to_string()));
            }
        }
    }
    Ok(latest.map(|(_, l)| l))
}

async fn publish(lake: &Lake, year: Year, now: i64) -> Result<()> {
    let Year { ano, lote, .. } = &year;
    let (ano, lote) = (*ano, lote.as_str());
    let summary = HashMap::from([("vigia.lote".to_string(), lote.to_string())]);

    let mut objects = Vec::new();
    for s in &year.sources {
        objects.push(lake.bronze(s.nome, ano, &s.sha256, &s.body).await?);
    }

    for (name, snapshot) in &year.silver {
        let content = camara::TABLES.iter().find(|(n, _)| n == name).unwrap().1;
        let table = lake.table("prata", name, &scd_columns(content)).await?;
        let state = scd::current(
            &lake
                .read(&table, ano, &["chave", "hash", "operacao", "valido_desde"])
                .await?,
        )?;
        let delta = scd::delta(snapshot, &state)?;
        let mut rows = tag(&delta, ano, lote, Some(now))?;
        let counts = ["I", "A", "R"].map(|op| {
            delta
                .column("operacao")
                .ok()
                .and_then(|c| {
                    c.as_materialized_series()
                        .str()
                        .ok()
                        .map(|s| s.equal(op).sum().unwrap_or(0))
                })
                .unwrap_or(0)
        });
        lake.append(&table, ano, &mut rows, summary.clone()).await?;
        println!(
            "prata.{name} {ano}: {} registros; +{} novos, {} alterados, {} removidos",
            snapshot.height(),
            counts[0],
            counts[1],
            counts[2]
        );
    }

    for (name, frame) in &year.gold {
        let table = lake.table("ouro", name, &gold_columns(name)).await?;
        // A batch's aggregates are written once (a rerun or a file reverting
        // to an earlier version reuses them).
        let mut done = false;
        for batch in lake.read(&table, ano, &["lote"]).await? {
            done |= lago::strings(&batch, "lote")?
                .iter()
                .any(|v| v == Some(lote));
        }
        if done {
            println!("ouro.{name} {ano}: lote já publicado");
            continue;
        }
        let mut rows = tag(frame, ano, lote, None)?;
        lake.append(&table, ano, &mut rows, summary.clone()).await?;
        println!("ouro.{name} {ano}: {} linhas", frame.height());
    }

    // Last: marks the batch complete for scripts/metrics.ts.
    let table = lake.table("bronze", "arquivos", &file_columns()).await?;
    let s = &year.sources;
    let mut files = df!(
        "arquivo" => s.iter().map(|s| s.arquivo.clone()).collect::<Vec<_>>(),
        "url" => s.iter().map(|s| s.url.clone()).collect::<Vec<_>>(),
        "sha256" => s.iter().map(|s| s.sha256.clone()).collect::<Vec<_>>(),
        "bytes" => s.iter().map(|s| s.body.len() as i64).collect::<Vec<_>>(),
        "campos" => year.shapes.clone(),
        "objeto" => objects,
    )?
    .lazy()
    .with_columns([
        lit(ano).alias("ano"),
        lit(lote).alias("lote"),
        lit(now)
            .cast(DataType::Datetime(TimeUnit::Microseconds, None))
            .alias("coletado_em"),
    ])
    .collect()?;
    lake.append(&table, ano, &mut files, summary).await?;
    println!("bronze.arquivos {ano}: lote {lote}");
    Ok(())
}

fn write_local(dir: &str, year: &mut Year) -> Result<()> {
    let layers = [("prata", &mut year.silver), ("ouro", &mut year.gold)];
    for (layer, frames) in layers {
        for (name, frame) in frames.iter_mut() {
            let folder = format!("{dir}/{layer}/{name}");
            std::fs::create_dir_all(&folder)?;
            let path = format!("{folder}/{}.parquet", year.ano);
            ParquetWriter::new(std::fs::File::create(&path)?).finish(frame)?;
            println!("{path}: {} linhas", frame.height());
        }
    }
    Ok(())
}

async fn run() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let (mut out, mut requested) = (None, Vec::new());
    while let Some(arg) = args.next() {
        if arg == "--out" {
            out = Some(args.next().context("--out precisa de uma pasta")?);
        } else {
            requested.push(
                arg.parse::<i32>()
                    .with_context(|| format!("ano inválido: {arg}"))?,
            );
        }
    }
    let today = Utc::now().with_timezone(&FixedOffset::west_opt(3 * 3600).unwrap());
    let current = today.year();
    // Late December votes can land in the previous year's file in January.
    let years = if !requested.is_empty() {
        requested.clone()
    } else if today.month() == 1 {
        vec![current - 1, current]
    } else {
        vec![current]
    };
    if years.iter().any(|y| *y < FIRST_YEAR || *y > current) {
        bail!("anos válidos: {FIRST_YEAR}–{current}");
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(120))
        // Follow redirects only inside the Câmara's file tree.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt
                .url()
                .as_str()
                .starts_with(&format!("{}/", camara::FILES))
                && attempt.previous().len() < 5
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()?;
    let lake = match out {
        None => Some(Lake::connect().await?),
        Some(_) => None,
    };
    let now = Utc::now().timestamp_micros();

    for ano in years {
        let sources = match camara::download(&client, ano).await {
            Ok(sources) => sources,
            // Only the default run tolerates a year not published yet.
            Err(error) if error.is::<Missing>() && requested.is_empty() => {
                println!("{ano}: {error}; ano ignorado");
                continue;
            }
            Err(error) => return Err(error),
        };
        let lote = camara::lote(&sources);
        if let Some(lake) = &lake
            && latest_batch(lake, ano).await?.as_deref() == Some(lote.as_str())
        {
            println!("{ano}: fontes sem mudança (lote {lote}); nada gravado");
            continue;
        }
        let mut year = build(ano, sources)?;
        match (&lake, &out) {
            (Some(lake), _) => publish(lake, year, now).await?,
            (None, Some(dir)) => write_local(dir, &mut year)?,
            _ => unreachable!(),
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        // One line, no tokens: errors never include credentials.
        eprintln!("Falha ao gravar o lake: {error:#}");
        std::process::exit(1);
    }
}
