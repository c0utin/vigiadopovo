//! Bronze to silver: downloads one year of the Câmara's open-data files and
//! turns them into typed Polars frames, one row per record, each with its
//! natural key (`chave`) and a content hash (`hash`).
//!
//! `hash` is the SHA-256 (hex) of the compact JSON array of the row's content
//! columns, in table order: text as string, integers as numbers, dates as
//! "AAAA-MM-DD", instants as published ("AAAA-MM-DDTHH:MM:SS"), empty as null.
//! Anyone can recompute it from the raw file kept in bronze.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use chrono::{NaiveDate, NaiveDateTime};
use polars::prelude::{DataFrame, DataType, IntoColumn, NamedFrom, Series, TimeUnit};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub const FILES: &str = "https://dadosabertos.camara.leg.br/arquivos";
pub const NAMES: [&str; 4] = [
    "votacoes",
    "votacoesVotos",
    "votacoesOrientacoes",
    "votacoesProposicoes",
];
const MAX_BYTES: usize = 512 * 1024 * 1024;

/// The Câmara has not published this file (yet).
#[derive(Debug)]
pub struct Missing(pub String);
impl std::fmt::Display for Missing {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "arquivo não publicado: {}", self.0)
    }
}
impl std::error::Error for Missing {}

pub struct Source {
    pub nome: &'static str,
    pub arquivo: String,
    pub url: String,
    pub sha256: String,
    pub body: Vec<u8>,
}

pub fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Same fingerprint as scripts/metrics.ts used: the sorted "arquivo:sha256"
/// lines of the year's four files.
pub fn lote(sources: &[Source]) -> String {
    let mut lines: Vec<String> = sources
        .iter()
        .map(|s| format!("{}:{}", s.arquivo, s.sha256))
        .collect();
    lines.sort();
    sha256(lines.join("\n").as_bytes())
}

pub async fn download(client: &reqwest::Client, ano: i32) -> Result<Vec<Source>> {
    let mut sources = Vec::new();
    for nome in NAMES {
        let arquivo = format!("{nome}-{ano}.json");
        let url = format!("{FILES}/{nome}/json/{arquivo}");
        let body = fetch(client, &url).await?;
        sources.push(Source {
            nome,
            sha256: sha256(&body),
            arquivo,
            url,
            body,
        });
    }
    Ok(sources)
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Vec<u8>> {
    let mut attempt = 0;
    loop {
        match fetch_once(client, url).await {
            Ok(body) => return Ok(body),
            Err(error) if error.is::<Missing>() || attempt == 2 => return Err(error),
            Err(error) => {
                eprintln!("{url}: {error:#}; nova tentativa");
                tokio::time::sleep(Duration::from_secs(5 << attempt)).await;
                attempt += 1;
            }
        }
    }
}

async fn fetch_once(client: &reqwest::Client, url: &str) -> Result<Vec<u8>> {
    let mut response = client.get(url).send().await?;
    // Redirects are followed only inside the Câmara's file tree (see main.rs).
    if !response.url().as_str().starts_with(&format!("{FILES}/")) {
        bail!("Redirecionamento inesperado: {url}");
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(Missing(url.to_string()).into());
    }
    let response_status = response.status();
    if !response_status.is_success() {
        bail!("HTTP {response_status}");
    }
    let expected = response.content_length();
    if expected.is_some_and(|n| n as usize > MAX_BYTES) {
        bail!("Arquivo maior que o limite: {url}");
    }
    let mut body = Vec::with_capacity(expected.unwrap_or(0) as usize);
    while let Some(chunk) = response.chunk().await? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            bail!("Arquivo maior que o limite: {url}");
        }
    }
    // A dropped connection can end the body early without an error (2022).
    if expected.is_some_and(|n| n as usize != body.len()) {
        bail!("Download incompleto: {url}");
    }
    Ok(body)
}

// ---- API shape ------------------------------------------------------------

/// Field names one record publishes, nested objects as "pai.filho".
struct Fields(Vec<String>);

impl<'de> Deserialize<'de> for Fields {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        struct Visitor;
        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Fields;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("um objeto")
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> std::result::Result<Fields, A::Error> {
                let mut names = Vec::new();
                while let Some(key) = map.next_key::<String>()? {
                    let nested: Nested = map.next_value()?;
                    names.extend(nested.0.into_iter().map(|n| format!("{key}.{n}")));
                    names.push(key);
                }
                Ok(Fields(names))
            }
        }
        d.deserialize_map(Visitor)
    }
}

/// A nested value: its field names when it is an object, nothing otherwise.
struct Nested(Vec<String>);

impl<'de> Deserialize<'de> for Nested {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        struct Visitor;
        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Nested;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("qualquer valor")
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> std::result::Result<Nested, A::Error> {
                let mut names = Vec::new();
                while let Some(key) = map.next_key::<String>()? {
                    map.next_value::<serde::de::IgnoredAny>()?;
                    names.push(key);
                }
                Ok(Nested(names))
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> std::result::Result<Nested, A::Error> {
                while seq.next_element::<serde::de::IgnoredAny>()?.is_some() {}
                Ok(Nested(vec![]))
            }
            fn visit_unit<E>(self) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_none<E>(self) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_bool<E>(self, _: bool) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_i64<E>(self, _: i64) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_u64<E>(self, _: u64) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_f64<E>(self, _: f64) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
            fn visit_str<E>(self, _: &str) -> std::result::Result<Nested, E> {
                Ok(Nested(vec![]))
            }
        }
        d.deserialize_any(Visitor)
    }
}

/// Fields the pipeline reads from each file. A rename or removal in the API
/// fails the year instead of silently turning into nulls (and false changes).
const USED: [(&str, &[&str]); 4] = [
    (
        "votacoes",
        &[
            "id",
            "data",
            "dataHoraRegistro",
            "idOrgao",
            "siglaOrgao",
            "aprovacao",
            "votosSim",
            "votosNao",
            "votosOutros",
            "descricao",
        ],
    ),
    (
        "votacoesVotos",
        &[
            "idVotacao",
            "dataHoraVoto",
            "voto",
            "deputado_",
            "deputado_.id",
            "deputado_.nome",
            "deputado_.siglaPartido",
            "deputado_.siglaUf",
            "deputado_.idLegislatura",
        ],
    ),
    (
        "votacoesOrientacoes",
        &["idVotacao", "siglaOrgao", "siglaBancada", "orientacao"],
    ),
    (
        "votacoesProposicoes",
        &[
            "idVotacao",
            "proposicao_",
            "proposicao_.id",
            "proposicao_.siglaTipo",
            "proposicao_.numero",
            "proposicao_.ano",
            "proposicao_.titulo",
            "proposicao_.ementa",
        ],
    ),
];

/// The sorted field list a file publishes (its API "version"), checked
/// against the fields the pipeline reads.
pub fn shape(source: &Source) -> Result<String> {
    let file: File<Fields> = serde_json::from_slice(&source.body)
        .with_context(|| format!("{}: JSON inválido", source.arquivo))?;
    let all: std::collections::BTreeSet<String> =
        file.dados.into_iter().flat_map(|f| f.0).collect();
    let (_, used) = USED.iter().find(|(n, _)| *n == source.nome).unwrap();
    let missing: Vec<&str> = used.iter().copied().filter(|u| !all.contains(*u)).collect();
    // An empty file (early January) has no fields to check.
    if !all.is_empty() && !missing.is_empty() {
        bail!(
            "A API mudou: {} não tem mais {}",
            source.arquivo,
            missing.join(", ")
        );
    }
    Ok(all.into_iter().collect::<Vec<_>>().join(","))
}

// ---- Parsing --------------------------------------------------------------

#[derive(Deserialize)]
struct File<T> {
    dados: Vec<T>,
}

/// Integers are published as numbers or as strings; "" means no value.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum Num {
    I(i64),
    S(String),
}

fn int(value: &Option<Num>) -> Result<Option<i64>> {
    Ok(match value {
        None => None,
        Some(Num::I(n)) => Some(*n),
        Some(Num::S(s)) if s.is_empty() => None,
        Some(Num::S(s)) => Some(
            s.parse()
                .with_context(|| format!("inteiro inválido: {s}"))?,
        ),
    })
}

fn text(value: &Option<String>) -> Option<String> {
    value.clone().filter(|s| !s.is_empty())
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Votacao {
    id: String,
    data: Option<String>,
    dataHoraRegistro: Option<String>,
    idOrgao: Option<Num>,
    siglaOrgao: Option<String>,
    aprovacao: Option<Num>,
    votosSim: Option<Num>,
    votosNao: Option<Num>,
    votosOutros: Option<Num>,
    descricao: Option<String>,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Voto {
    idVotacao: String,
    dataHoraVoto: Option<String>,
    voto: Option<String>,
    deputado_: Deputado,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Deputado {
    id: Option<Num>,
    nome: Option<String>,
    siglaPartido: Option<String>,
    siglaUf: Option<String>,
    idLegislatura: Option<Num>,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Orientacao {
    idVotacao: String,
    siglaOrgao: Option<String>,
    siglaBancada: String,
    orientacao: Option<String>,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct VotacaoProposicao {
    idVotacao: String,
    proposicao_: Proposicao,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Proposicao {
    id: Num,
    siglaTipo: Option<String>,
    numero: Option<Num>,
    ano: Option<Num>,
    titulo: Option<String>,
    ementa: Option<String>,
}

// ---- Typed columns with per-row hashing -----------------------------------

#[derive(Clone, Copy)]
pub enum Kind {
    Text,
    Int,
    Long,
    Date,
    Instant,
}

impl Kind {
    pub fn dtype(self) -> DataType {
        match self {
            Kind::Text => DataType::String,
            Kind::Int => DataType::Int32,
            Kind::Long => DataType::Int64,
            Kind::Date => DataType::Date,
            Kind::Instant => DataType::Datetime(TimeUnit::Microseconds, None),
        }
    }
}

enum Cell {
    T(Option<String>),
    I(Option<i64>),
    D(Option<String>),
    Ts(Option<String>),
}

enum Column {
    Text(Vec<Option<String>>),
    Int(Vec<Option<i64>>),
    Date(Vec<Option<i32>>),
    Instant(Vec<Option<i64>>),
}

fn date(value: &str) -> Result<i32> {
    let day = NaiveDate::parse_from_str(&value[..value.len().min(10)], "%Y-%m-%d")
        .with_context(|| format!("data inválida: {value}"))?;
    Ok((day - NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()).num_days() as i32)
}

fn instant(value: &str) -> Result<i64> {
    let parsed = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f"))
        .with_context(|| format!("instante inválido: {value}"))?;
    Ok(parsed.and_utc().timestamp_micros())
}

/// A silver table being built: content columns plus `chave` and `hash`.
pub struct Builder {
    pub name: &'static str,
    columns: Vec<(&'static str, Kind, Column)>,
    chaves: Vec<String>,
    hashes: Vec<String>,
    seen: HashSet<String>,
}

impl Builder {
    fn new(name: &'static str, schema: &[(&'static str, Kind)]) -> Self {
        let columns = schema
            .iter()
            .map(|&(n, k)| {
                let column = match k {
                    Kind::Text => Column::Text(vec![]),
                    Kind::Int | Kind::Long => Column::Int(vec![]),
                    Kind::Date => Column::Date(vec![]),
                    Kind::Instant => Column::Instant(vec![]),
                };
                (n, k, column)
            })
            .collect();
        Builder {
            name,
            columns,
            chaves: vec![],
            hashes: vec![],
            seen: HashSet::new(),
        }
    }

    fn push(&mut self, ano: i32, chave: String, cells: Vec<Cell>) -> Result<()> {
        // Never pick one of two records published under the same key.
        if !self.seen.insert(chave.clone()) {
            bail!("Registro repetido em {} {ano}: {chave}", self.name);
        }
        let mut json = Vec::with_capacity(cells.len());
        for ((_, _, column), cell) in self.columns.iter_mut().zip(cells) {
            match (column, cell) {
                (Column::Text(v), Cell::T(x)) => {
                    json.push(x.clone().map_or(Value::Null, Value::String));
                    v.push(x);
                }
                (Column::Int(v), Cell::I(x)) => {
                    json.push(x.map_or(Value::Null, Value::from));
                    v.push(x);
                }
                (Column::Date(v), Cell::D(x)) => {
                    let day = x.as_deref().map(date).transpose()?;
                    json.push(
                        x.map_or(Value::Null, |s| Value::String(s[..s.len().min(10)].into())),
                    );
                    v.push(day);
                }
                (Column::Instant(v), Cell::Ts(x)) => {
                    v.push(x.as_deref().map(instant).transpose()?);
                    json.push(x.map_or(Value::Null, Value::String));
                }
                _ => unreachable!("cell order matches the schema"),
            }
        }
        self.hashes
            .push(sha256(serde_json::to_string(&json)?.as_bytes()));
        self.chaves.push(chave);
        Ok(())
    }

    /// Frame with `chave`, `hash` and the content columns, in that order.
    pub fn finish(self) -> Result<DataFrame> {
        let mut series = vec![
            Series::new("chave".into(), self.chaves).into_column(),
            Series::new("hash".into(), self.hashes).into_column(),
        ];
        for (name, kind, column) in self.columns {
            let s = match column {
                Column::Text(v) => Series::new(name.into(), v),
                Column::Int(v) => Series::new(name.into(), v),
                Column::Date(v) => Series::new(name.into(), v),
                Column::Instant(v) => Series::new(name.into(), v),
            };
            series.push(s.cast(&kind.dtype())?.into_column());
        }
        Ok(DataFrame::new_infer_height(series)?)
    }
}

pub const VOTACOES: &[(&str, Kind)] = &[
    ("id", Kind::Text),
    ("data", Kind::Date),
    ("data_hora_registro", Kind::Instant),
    ("id_orgao", Kind::Long),
    ("sigla_orgao", Kind::Text),
    ("aprovacao", Kind::Int),
    ("votos_sim", Kind::Int),
    ("votos_nao", Kind::Int),
    ("votos_outros", Kind::Int),
    ("votos_registrados", Kind::Int),
    ("descricao", Kind::Text),
];
pub const VOTOS: &[(&str, Kind)] = &[
    ("id_votacao", Kind::Text),
    ("data_hora_voto", Kind::Instant),
    ("voto", Kind::Text),
    ("deputado_id", Kind::Long),
    ("deputado_nome", Kind::Text),
    ("partido", Kind::Text),
    ("uf", Kind::Text),
    ("legislatura", Kind::Int),
];
pub const ORIENTACOES: &[(&str, Kind)] = &[
    ("id_votacao", Kind::Text),
    ("sigla_orgao", Kind::Text),
    ("bancada", Kind::Text),
    ("bloco", Kind::Text),
    ("orientacao", Kind::Text),
];
pub const VOTACOES_PROPOSICOES: &[(&str, Kind)] = &[
    ("id_votacao", Kind::Text),
    ("proposicao_id", Kind::Long),
    ("sigla_tipo", Kind::Text),
    ("numero", Kind::Int),
    ("ano_proposicao", Kind::Int),
    ("titulo", Kind::Text),
    ("ementa", Kind::Text),
];
pub const TABLES: [(&str, &[(&str, Kind)]); 4] = [
    ("votacoes", VOTACOES),
    ("votos", VOTOS),
    ("orientacoes", ORIENTACOES),
    ("votacoes_proposicoes", VOTACOES_PROPOSICOES),
];

/// The Câmara spelled the same leadership differently over the years ("GOV."
/// until 2022, "Governo" after). `bloco` gives these four one name; every
/// other bancada (parties, federations, truncated bloc names) stays as published.
fn bloco(bancada: &str) -> Option<String> {
    match bancada.to_uppercase().as_str() {
        "GOV." | "GOVERNO" => Some("Governo".into()),
        "OPOSIÇÃO" => Some("Oposição".into()),
        "MAIORIA" => Some("Maioria".into()),
        "MINORIA" => Some("Minoria".into()),
        _ => None,
    }
}

/// The year's four silver frames, keyed by table name.
pub fn parse(ano: i32, sources: &[Source]) -> Result<Vec<(&'static str, DataFrame)>> {
    let body = |nome: &str| -> &[u8] { &sources.iter().find(|s| s.nome == nome).unwrap().body };
    let votacoes: File<Votacao> = serde_json::from_slice(body("votacoes"))?;
    let votos: File<Voto> = serde_json::from_slice(body("votacoesVotos"))?;

    let ids: HashSet<&str> = votacoes.dados.iter().map(|v| v.id.as_str()).collect();
    if ids.len() != votacoes.dados.len() {
        bail!("Votação repetida no arquivo de {ano}");
    }

    let mut ballots: HashMap<&str, i64> = HashMap::new();
    let mut table = Builder::new("votos", VOTOS);
    for vote in &votos.dados {
        let deputy = &vote.deputado_;
        let id = int(&deputy.id)?;
        // A few old records have no deputy ID (one in 2004). They are kept with
        // a null ID and the published name; no ID is inferred from the name.
        let who = match id {
            Some(id) if id != 0 => id.to_string(),
            _ => format!("nome:{}", deputy.nome.clone().unwrap_or_default()),
        };
        if !ids.contains(vote.idVotacao.as_str()) {
            bail!("Voto sem votação correspondente no arquivo de {ano}");
        }
        *ballots.entry(vote.idVotacao.as_str()).or_default() += 1;
        // E-mail and photo URL are dropped, as in the portal's captures.
        table.push(
            ano,
            format!("{}:{who}", vote.idVotacao),
            vec![
                Cell::T(Some(vote.idVotacao.clone())),
                Cell::Ts(text(&vote.dataHoraVoto)),
                Cell::T(text(&vote.voto)),
                Cell::I(id),
                Cell::T(deputy.nome.clone()),
                Cell::T(text(&deputy.siglaPartido)),
                Cell::T(text(&deputy.siglaUf)),
                Cell::I(int(&deputy.idLegislatura)?),
            ],
        )?;
    }
    let votos_frame = table.finish()?;

    let mut table = Builder::new("votacoes", VOTACOES);
    for v in &votacoes.dados {
        table.push(
            ano,
            v.id.clone(),
            vec![
                Cell::T(Some(v.id.clone())),
                Cell::D(text(&v.data)),
                Cell::Ts(text(&v.dataHoraRegistro)),
                Cell::I(int(&v.idOrgao)?),
                Cell::T(v.siglaOrgao.clone()),
                Cell::I(int(&v.aprovacao)?),
                Cell::I(int(&v.votosSim)?),
                Cell::I(int(&v.votosNao)?),
                Cell::I(int(&v.votosOutros)?),
                Cell::I(Some(ballots.get(v.id.as_str()).copied().unwrap_or(0))),
                Cell::T(text(&v.descricao)),
            ],
        )?;
    }
    let votacoes_frame = table.finish()?;
    drop(votos);

    let orientacoes: File<Orientacao> = serde_json::from_slice(body("votacoesOrientacoes"))?;
    let mut table = Builder::new("orientacoes", ORIENTACOES);
    for o in &orientacoes.dados {
        table.push(
            ano,
            format!("{}:{}", o.idVotacao, o.siglaBancada),
            vec![
                Cell::T(Some(o.idVotacao.clone())),
                Cell::T(text(&o.siglaOrgao)),
                Cell::T(Some(o.siglaBancada.clone())),
                Cell::T(bloco(&o.siglaBancada)),
                // An empty string is kept as null: no orientation recorded.
                Cell::T(text(&o.orientacao)),
            ],
        )?;
    }
    let orientacoes_frame = table.finish()?;

    let propostas: File<VotacaoProposicao> = serde_json::from_slice(body("votacoesProposicoes"))?;
    let mut table = Builder::new("votacoes_proposicoes", VOTACOES_PROPOSICOES);
    for p in &propostas.dados {
        let prop = &p.proposicao_;
        let id = int(&Some(prop.id.clone()))?.context("proposição sem id")?;
        table.push(
            ano,
            format!("{}:{id}", p.idVotacao),
            vec![
                Cell::T(Some(p.idVotacao.clone())),
                Cell::I(Some(id)),
                Cell::T(text(&prop.siglaTipo)),
                Cell::I(int(&prop.numero)?),
                Cell::I(int(&prop.ano)?),
                Cell::T(text(&prop.titulo)),
                Cell::T(text(&prop.ementa)),
            ],
        )?;
    }

    Ok(vec![
        ("votacoes", votacoes_frame),
        ("votos", votos_frame),
        ("orientacoes", orientacoes_frame),
        ("votacoes_proposicoes", table.finish()?),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(nome: &'static str, body: &str) -> Source {
        Source {
            nome,
            arquivo: format!("{nome}-2019.json"),
            url: String::new(),
            sha256: sha256(body.as_bytes()),
            body: body.as_bytes().to_vec(),
        }
    }

    const ORIENTACAO: &str = r#"{"dados":[{"idVotacao":"1-1","siglaOrgao":"PLEN","siglaBancada":"GOV.","orientacao":"Sim"}]}"#;

    #[test]
    fn shape_lists_published_fields_and_rejects_a_removed_one() {
        let ok = source("votacoesOrientacoes", ORIENTACAO);
        assert_eq!(
            shape(&ok).unwrap(),
            "idVotacao,orientacao,siglaBancada,siglaOrgao"
        );
        let renamed = source(
            "votacoesOrientacoes",
            r#"{"dados":[{"idVotacao":"1-1","siglaOrgao":"PLEN","bancada":"GOV.","orientacao":"Sim"}]}"#,
        );
        let error = shape(&renamed).unwrap_err().to_string();
        assert!(error.contains("siglaBancada"), "{error}");
        assert!(shape(&source("votacoesOrientacoes", r#"{"dados":[]}"#)).is_ok());
    }

    #[test]
    fn batch_id_does_not_depend_on_download_order() {
        let a = source("votacoes", "a");
        let b = source("votacoesVotos", "b");
        let one = lote(&[source("votacoes", "a"), source("votacoesVotos", "b")]);
        assert_eq!(one, lote(&[b, a]));
        // Same lines metrics.ts hashes to check a batch.
        let lines = format!(
            "votacoes-2019.json:{}\nvotacoesVotos-2019.json:{}",
            sha256(b"a"),
            sha256(b"b")
        );
        assert_eq!(one, sha256(lines.as_bytes()));
    }

    #[test]
    fn row_hash_is_reproducible_from_the_published_values() {
        let mut table = Builder::new("orientacoes", ORIENTACOES);
        table
            .push(
                2019,
                "1-1:GOV.".into(),
                vec![
                    Cell::T(Some("1-1".into())),
                    Cell::T(Some("PLEN".into())),
                    Cell::T(Some("GOV.".into())),
                    Cell::T(bloco("GOV.")),
                    Cell::T(None),
                ],
            )
            .unwrap();
        let frame = table.finish().unwrap();
        let hash = frame.column("hash").unwrap().str().unwrap().get(0).unwrap();
        assert_eq!(hash, sha256(br#"["1-1","PLEN","GOV.","Governo",null]"#));
        // The same key twice is never resolved by picking one record.
        let mut table = Builder::new("orientacoes", ORIENTACOES);
        let row = || (0..5).map(|_| Cell::T(None)).collect::<Vec<_>>();
        table.push(2019, "k".into(), row()).unwrap();
        assert!(table.push(2019, "k".into(), row()).is_err());
    }
}
