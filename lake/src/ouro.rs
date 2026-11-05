//! Silver to gold: the aggregates the site publishes, computed with Polars
//! from one year's complete silver state. Same definitions as the queries
//! scripts/metrics.ts ran on R2 SQL before this layer existed (worker/
//! definitions.ts documents them for readers):
//!
//! - a "registered vote" is Sim, Não, Abstenção or Obstrução;
//! - alignment counts registered votes in votings where the bancada oriented
//!   Sim or Não, and how many match the orientation;
//! - joins never match null keys, and null group keys form their own group.

use anyhow::Result;
use polars::prelude::*;

const POSITIONS: [&str; 4] = ["Sim", "Não", "Abstenção", "Obstrução"];
const ORIENTED: [&str; 2] = ["Sim", "Não"];

fn one_of(column: &str, values: &[&str]) -> Expr {
    values
        .iter()
        .map(|v| col(column).eq(lit(*v)))
        .reduce(|a, b| a.or(b))
        .unwrap()
        .fill_null(lit(false))
}

fn count_if(predicate: Expr, name: &str) -> Expr {
    predicate
        .fill_null(lit(false))
        .cast(DataType::Int64)
        .sum()
        .alias(name)
}

fn frame(tables: &[(&'static str, DataFrame)], name: &str) -> LazyFrame {
    tables
        .iter()
        .find(|(n, _)| *n == name)
        .unwrap()
        .1
        .clone()
        .lazy()
}

pub fn compute(tables: &[(&'static str, DataFrame)]) -> Result<Vec<(&'static str, DataFrame)>> {
    let votos = frame(tables, "votos");
    let orientacoes = frame(tables, "orientacoes");
    let votacoes = frame(tables, "votacoes");

    let alinhamento = votos
        .clone()
        .filter(one_of("voto", &POSITIONS))
        .join(
            orientacoes
                .clone()
                .filter(
                    col("bloco")
                        .is_not_null()
                        .and(one_of("orientacao", &ORIENTED)),
                )
                .select([col("id_votacao"), col("bloco"), col("orientacao")]),
            [col("id_votacao")],
            [col("id_votacao")],
            JoinArgs::new(JoinType::Inner),
        )
        .group_by([col("bloco"), col("partido")])
        .agg([
            len().cast(DataType::Int64).alias("votos"),
            count_if(col("voto").eq(col("orientacao")), "alinhados"),
        ])
        .sort_by_exprs(
            [col("bloco"), col("votos"), col("partido")],
            SortMultipleOptions::default()
                .with_order_descending_multi([false, true, false])
                .with_nulls_last(true),
        )
        .collect()?;

    let governo = orientacoes
        .filter(col("bloco").eq(lit("Governo")))
        .select([col("id_votacao"), col("orientacao")]);
    let deputados = votos
        .filter(col("deputado_id").is_not_null())
        .join(
            votacoes.clone().select([col("id"), col("sigla_orgao")]),
            [col("id_votacao")],
            [col("id")],
            JoinArgs::new(JoinType::Inner),
        )
        .join(
            governo,
            [col("id_votacao")],
            [col("id_votacao")],
            JoinArgs::new(JoinType::Left),
        )
        .with_column(
            when(col("sigla_orgao").eq(lit("PLEN")).fill_null(lit(false)))
                .then(lit("plenario"))
                .otherwise(lit("outros"))
                .alias("orgao"),
        )
        .group_by([col("deputado_id"), col("orgao"), col("voto")])
        .agg([
            len().cast(DataType::Int64).alias("votos"),
            count_if(
                one_of("orientacao", &ORIENTED).and(one_of("voto", &POSITIONS)),
                "com_orientacao_governo",
            ),
            count_if(col("orientacao").eq(col("voto")), "alinhados_governo"),
        ])
        .sort_by_exprs(
            [col("deputado_id"), col("votos"), col("orgao"), col("voto")],
            SortMultipleOptions::default()
                .with_order_descending_multi([false, true, false, false])
                .with_nulls_last(true),
        )
        .collect()?;

    let votacoes_mes = votacoes
        .with_column(col("data").dt().month().cast(DataType::Int32).alias("mes"))
        .group_by([col("mes")])
        .agg([
            len().cast(DataType::Int64).alias("votacoes"),
            count_if(col("votos_registrados").gt(lit(0)), "nominais"),
            count_if(col("sigla_orgao").eq(lit("PLEN")), "plenario"),
        ])
        .sort(
            ["mes"],
            SortMultipleOptions::default().with_nulls_last(true),
        )
        .collect()?;

    Ok(vec![
        ("alinhamento_bancada", alinhamento),
        ("deputado_votos", deputados),
        ("votacoes_mes", votacoes_mes),
    ])
}
