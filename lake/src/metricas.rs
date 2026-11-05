//! The publisher's input: `<out>/metricas/<ano>.json`, the gold rows of one
//! batch in the order the site's queries returned them, with the value formats
//! of the published API (integers as numbers, instants as UTC text).

use anyhow::{Context, Result, bail};
use chrono::DateTime;
use polars::prelude::*;
use serde_json::{Map, Value, json};

/// Writes one year's file. Each frame holds the columns of one table, already
/// filtered to the batch `lote`.
pub fn write(
    out: &str,
    ano: i32,
    lote: &str,
    alinhamento: DataFrame,
    deputados: DataFrame,
    votacoes: DataFrame,
    fontes: DataFrame,
) -> Result<()> {
    let file = document(lote, alinhamento, deputados, votacoes, fontes)?;
    let dir = format!("{out}/metricas");
    std::fs::create_dir_all(&dir)?;
    std::fs::write(format!("{dir}/{ano}.json"), serde_json::to_vec(&file)?)?;
    println!("{dir}/{ano}.json: lote {lote}");
    Ok(())
}

fn document(
    lote: &str,
    alinhamento: DataFrame,
    deputados: DataFrame,
    votacoes: DataFrame,
    fontes: DataFrame,
) -> Result<Value> {
    let deputados = deputados
        .lazy()
        .with_column(col("deputado_id").alias("deputado"))
        .collect()?;
    Ok(json!({
        "lote": lote,
        "alinhamento": rows(
            alinhamento,
            &["bloco", "partido", "votos", "alinhados"],
            &["bloco", "votos", "partido"],
            &[false, true, false],
        )?,
        "deputados": rows(
            deputados,
            &["deputado", "orgao", "voto", "votos", "com_orientacao_governo", "alinhados_governo"],
            &["deputado", "votos", "orgao", "voto"],
            &[false, true, false, false],
        )?,
        "votacoes": rows(votacoes, &["mes", "votacoes", "nominais", "plenario"], &["mes"], &[false])?,
        "fontes": rows(
            fontes,
            &["ano", "arquivo", "url", "sha256", "bytes", "objeto", "coletado_em"],
            &["arquivo"],
            &[false],
        )?,
    }))
}

/// The query's columns, sorted by its ORDER BY with nulls last, as objects.
fn rows(frame: DataFrame, columns: &[&str], by: &[&str], descending: &[bool]) -> Result<Value> {
    let frame = frame
        .lazy()
        .select(columns.iter().map(|c| col(*c)).collect::<Vec<_>>())
        .sort_by_exprs(
            by.iter().map(|c| col(*c)).collect::<Vec<_>>(),
            SortMultipleOptions::default()
                .with_order_descending_multi(descending.to_vec())
                .with_nulls_last(true),
        )
        .collect()?;
    let mut out = Vec::with_capacity(frame.height());
    for i in 0..frame.height() {
        let mut row = Map::new();
        for column in frame.columns() {
            row.insert(column.name().to_string(), json_value(column.get(i)?)?);
        }
        out.push(Value::Object(row));
    }
    Ok(Value::Array(out))
}

fn json_value(value: AnyValue) -> Result<Value> {
    Ok(match value {
        AnyValue::Null => Value::Null,
        AnyValue::String(s) => Value::from(s),
        AnyValue::Int32(n) => Value::from(n),
        AnyValue::Int64(n) => Value::from(n),
        // "2026-11-05T04:51:26.585305Z": UTC, microseconds always printed.
        AnyValue::Datetime(micros, TimeUnit::Microseconds, _)
        | AnyValue::DatetimeOwned(micros, TimeUnit::Microseconds, _) => {
            let instant =
                DateTime::from_timestamp_micros(micros).context("instante fora do intervalo")?;
            Value::from(instant.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string())
        }
        other => bail!("valor sem formato JSON: {other:?}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rows out of order, a null bloco and a null partido, two deputies with
    /// ids that sort differently as numbers and as text, and an instant with
    /// a zero-padded fraction (2026-11-05T04:51:26.000250Z). Expected values
    /// are written by hand from the ORDER BY of each query.
    #[test]
    fn document_matches_the_contract() {
        let alinhamento = df!(
            "ano" => [2011i32; 4],
            "lote" => ["lote-de-teste"; 4],
            "bloco" => [None, Some("Governo"), Some("Governo"), Some("Governo")],
            "partido" => [Some("PSDB"), None, Some("PMDB"), Some("PT")],
            "votos" => [2382i64, 100, 4355, 5160],
            "alinhados" => [508i64, 90, 4047, 5033],
        )
        .unwrap();
        let deputados = df!(
            "ano" => [2011i32; 5],
            "lote" => ["lote-de-teste"; 5],
            "deputado_id" => [3151i64, 3151, 7, 3151, 7],
            "orgao" => ["plenario", "outros", "outros", "outros", "plenario"],
            "voto" => ["Sim", "Sim", "Não", "Não", "Sim"],
            "votos" => [29i64, 4, 3, 4, 10],
            "com_orientacao_governo" => [25i64, 0, 2, 0, 9],
            "alinhados_governo" => [17i64, 0, 1, 0, 8],
        )
        .unwrap();
        let votacoes = df!(
            "ano" => [2011i32; 3],
            "lote" => ["lote-de-teste"; 3],
            "mes" => [12i32, 2, 7],
            "votacoes" => [440i64, 69, 258],
            "nominais" => [7i64, 8, 5],
            "plenario" => [18i64, 68, 38],
        )
        .unwrap();
        let fontes = df!(
            "ano" => [2011i32; 2],
            "lote" => ["lote-de-teste"; 2],
            "arquivo" => ["votacoesVotos-2011.json", "votacoes-2011.json"],
            "url" => ["https://ex/votacoesVotos-2011.json", "https://ex/votacoes-2011.json"],
            "sha256" => ["bb", "aa"],
            "bytes" => [42i64, 7_099_959],
            "campos" => ["x", "y"],
            "objeto" => ["bronze/votacoesVotos", "bronze/votacoes"],
            "coletado_em" => [1_793_854_286_000_250i64; 2],
        )
        .unwrap()
        .lazy()
        .with_column(col("coletado_em").cast(DataType::Datetime(TimeUnit::Microseconds, None)))
        .collect()
        .unwrap();

        let file = document("lote-de-teste", alinhamento, deputados, votacoes, fontes).unwrap();

        assert_eq!(
            file,
            json!({
                "lote": "lote-de-teste",
                "alinhamento": [
                    {"bloco": "Governo", "partido": "PT", "votos": 5160, "alinhados": 5033},
                    {"bloco": "Governo", "partido": "PMDB", "votos": 4355, "alinhados": 4047},
                    {"bloco": "Governo", "partido": null, "votos": 100, "alinhados": 90},
                    {"bloco": null, "partido": "PSDB", "votos": 2382, "alinhados": 508},
                ],
                "deputados": [
                    {"deputado": 7, "orgao": "plenario", "voto": "Sim", "votos": 10,
                     "com_orientacao_governo": 9, "alinhados_governo": 8},
                    {"deputado": 7, "orgao": "outros", "voto": "Não", "votos": 3,
                     "com_orientacao_governo": 2, "alinhados_governo": 1},
                    {"deputado": 3151, "orgao": "plenario", "voto": "Sim", "votos": 29,
                     "com_orientacao_governo": 25, "alinhados_governo": 17},
                    {"deputado": 3151, "orgao": "outros", "voto": "Não", "votos": 4,
                     "com_orientacao_governo": 0, "alinhados_governo": 0},
                    {"deputado": 3151, "orgao": "outros", "voto": "Sim", "votos": 4,
                     "com_orientacao_governo": 0, "alinhados_governo": 0},
                ],
                "votacoes": [
                    {"mes": 2, "votacoes": 69, "nominais": 8, "plenario": 68},
                    {"mes": 7, "votacoes": 258, "nominais": 5, "plenario": 38},
                    {"mes": 12, "votacoes": 440, "nominais": 7, "plenario": 18},
                ],
                "fontes": [
                    {"ano": 2011, "arquivo": "votacoes-2011.json",
                     "url": "https://ex/votacoes-2011.json", "sha256": "aa",
                     "bytes": 7099959, "objeto": "bronze/votacoes",
                     "coletado_em": "2026-11-05T04:51:26.000250Z"},
                    {"ano": 2011, "arquivo": "votacoesVotos-2011.json",
                     "url": "https://ex/votacoesVotos-2011.json", "sha256": "bb",
                     "bytes": 42, "objeto": "bronze/votacoesVotos",
                     "coletado_em": "2026-11-05T04:51:26.000250Z"},
                ],
            })
        );
    }
}
