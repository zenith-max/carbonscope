from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "owid-co2-data.csv"
OUTPUT_FILE = ROOT / "data" / "processed_dataset.json"

REGION_EXCLUSIONS = {
    "World",
    "Africa",
    "Asia",
    "Europe",
    "North America",
    "South America",
    "Oceania",
    "Antarctica",
    "European Union",
    "International Transport",
    "Low-income countries",
    "Lower-middle-income countries",
    "Middle-income countries",
    "Upper-middle-income countries",
    "High-income countries",
    "Asia (excl. China)",
    "Europe (excl. EU-27)",
    "Europe (excl. EU-28)",
    "EU-27",
    "EU-28",
    "Netherlands Antilles",
    "French Equatorial Africa",
    "French West Africa",
    "Czechoslovakia",
    "USSR",
    "Yugoslavia",
    "East Germany",
    "West Germany",
    "Serbia and Montenegro",
}

NUMERIC_COLUMNS = {
    "population",
    "gdp",
    "co2",
    "co2_growth_abs",
    "co2_growth_prct",
    "co2_including_luc",
    "co2_including_luc_growth_abs",
    "co2_including_luc_growth_prct",
    "co2_including_luc_per_capita",
    "co2_including_luc_per_gdp",
    "co2_including_luc_per_unit_energy",
    "co2_per_capita",
    "co2_per_gdp",
    "co2_per_unit_energy",
    "total_ghg",
    "total_ghg_excluding_lucf",
    "ghg_per_capita",
    "ghg_excluding_lucf_per_capita",
    "methane",
    "methane_per_capita",
    "nitrous_oxide",
    "nitrous_oxide_per_capita",
    "cumulative_co2",
    "share_global_co2",
    "share_global_co2_including_luc",
    "trade_co2",
    "trade_co2_share",
    "co2_including_luc_per_capita",
    "co2_including_luc_per_gdp",
}


def clean_dataframe() -> pd.DataFrame:
    df = pd.read_csv(DATA_FILE)
    df.columns = [str(col).strip() for col in df.columns]
    df = df.drop_duplicates(subset=["country", "year"], keep="last")
    df = df[df["country"].notna()]
    df["country"] = df["country"].astype(str).str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df[df["year"].notna()]
    df = df[df["year"].between(1750, 2017)]
    df = df[~df["country"].isin(REGION_EXCLUSIONS)]
    df = df[df["country"] != ""]

    for column in df.columns:
        if column in {"country", "iso_code"}:
            continue
        if column == "year":
            continue
        if column in NUMERIC_COLUMNS or column.startswith("co2") or column.startswith("ghg") or column.startswith("methane") or column.startswith("nitrous") or column.startswith("trade") or column.startswith("cumulative") or column.startswith("share_global"):
            df[column] = pd.to_numeric(df[column], errors="coerce")

    for column in ["co2", "co2_including_luc", "total_ghg", "total_ghg_excluding_lucf"]:
        if column in df.columns:
            df[column] = df[column].fillna(0)

    return df.reset_index(drop=True)


def build_processed_payload() -> dict:
    df = clean_dataframe()
    output = {
        "meta": {
            "source": "Yoann Boyere's CO₂ & GHG Emissions dataset on Kaggle, based on Our World in Data",
            "coverage_start": int(df["year"].min()),
            "coverage_end": int(df["year"].max()),
            "countries": int(df["country"].nunique()),
            "generated_at": "2026-09-17",
        },
        "global": [
            {"year": int(row["year"]), "co2": float(row["co2"]) if pd.notna(row["co2"]) else 0.0}
            for row in df[df["country"] == "World"][ ["year", "co2"] ].drop_duplicates().sort_values("year").to_dict("records")
        ],
        "countries": [
            {
                "country": row["country"],
                "iso_code": row.get("iso_code"),
                "year": int(row["year"]),
                "co2": float(row["co2"]) if pd.notna(row.get("co2")) else 0.0,
                "population": float(row["population"]) if pd.notna(row.get("population")) else 0.0,
            }
            for _, row in df[ ["country", "iso_code", "year", "co2", "population"] ].drop_duplicates().sort_values(["country", "year"]).iterrows()
        ],
    }
    return output


def main() -> None:
    payload = build_processed_payload()
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Processed dataset saved to {OUTPUT_FILE}")
    print(f"Coverage: {payload['meta']['coverage_start']}–{payload['meta']['coverage_end']}")


if __name__ == "__main__":
    main()
