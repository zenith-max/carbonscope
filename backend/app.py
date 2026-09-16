from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "owid-co2-data.csv"
PROCESSED_FILE = ROOT / "data" / "processed_dataset.json"

EXCLUDED_COUNTRIES = {
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
    "EU-27",
    "EU-28",
    "USSR",
    "Yugoslavia",
    "Czechoslovakia",
    "East Germany",
    "West Germany",
}

app = FastAPI(title="CarbonScope API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def load_dataframe() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dataset file not found at {DATA_FILE}")

    df = pd.read_csv(DATA_FILE)
    df.columns = [str(col).strip() for col in df.columns]
    df = df.drop_duplicates(subset=["country", "year"], keep="last")
    df = df[df["country"].notna()]
    df["country"] = df["country"].astype(str).str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df[df["year"].notna()]
    df = df[df["year"].between(1750, 2017)]
    df = df[~df["country"].isin(EXCLUDED_COUNTRIES)]
    df = df[df["country"] != ""]

    for column in df.columns:
        if column in {"country", "iso_code", "year"}:
            continue
        if column.startswith("co2") or column.startswith("ghg") or column.startswith("methane") or column.startswith("nitrous") or column.startswith("trade") or column.startswith("cumulative") or column.startswith("share_global") or column in {"population", "gdp"}:
            df[column] = pd.to_numeric(df[column], errors="coerce")

    for column in ["co2", "co2_including_luc", "total_ghg", "total_ghg_excluding_lucf"]:
        if column in df.columns:
            df[column] = df[column].fillna(0)

    return df.reset_index(drop=True)


@lru_cache(maxsize=1)
def load_global_series() -> pd.DataFrame:
    df = load_dataframe()
    world = df[df["country"] == "World"].copy()
    return world[["year", "co2"]].drop_duplicates().sort_values("year").reset_index(drop=True)


def list_countries_for_year(year: int) -> pd.DataFrame:
    df = load_dataframe()
    year_df = df[df["year"] == year].copy()
    year_df = year_df[(year_df["co2"].notna()) & (year_df["co2"] > 0)]
    year_df = year_df[["country", "iso_code", "year", "co2", "population"]].copy()
    year_df = year_df.sort_values("co2", ascending=False).reset_index(drop=True)
    year_df["rank"] = year_df["co2"].rank(method="min", ascending=False).astype(int)
    year_df["co2"] = year_df["co2"].fillna(0)
    return year_df


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "dataset": str(DATA_FILE), "coverage": "1750-2017"}


@app.get("/api/global")
def global_emissions() -> dict[str, Any]:
    series = load_global_series().to_dict("records")
    return {"series": [{"year": int(item["year"]), "value": float(item["co2"] or 0)} for item in series]}


@app.get("/api/countries")
def countries(year: int = Query(2017, ge=1750, le=2017)) -> list[dict[str, Any]]:
    rows = list_countries_for_year(year)
    records = rows.to_dict("records")
    payload = []
    for item in records:
        previous_year = load_dataframe()[(load_dataframe()["country"] == item["country"]) & (load_dataframe()["year"] == year - 1)]
        change_value = None
        if not previous_year.empty:
            current = float(item["co2"] or 0)
            prev = float(previous_year.iloc[0].get("co2", 0) or 0)
            change_value = current - prev
        payload.append({
            "country": item["country"],
            "iso_code": item.get("iso_code"),
            "year": int(item["year"]),
            "co2": float(item["co2"] or 0),
            "population": float(item.get("population") or 0),
            "rank": int(item["rank"]),
            "change_from_previous_year": None if change_value is None else float(change_value),
        })
    return payload


@app.get("/api/country/{country_name}")
def country_detail(country_name: str) -> dict[str, Any]:
    df = load_dataframe()
    country_records = df[df["country"] == country_name].sort_values("year").copy()
    if country_records.empty:
        raise HTTPException(status_code=404, detail=f"Country not found: {country_name}")

    latest_year = int(country_records["year"].max())
    latest_value = float(country_records[country_records["year"] == latest_year]["co2"].iloc[0] or 0)
    first_year = int(country_records["year"].min())
    first_value = float(country_records[country_records["year"] == first_year]["co2"].iloc[0] or 0)
    highest_row = country_records.sort_values("co2", ascending=False).iloc[0]
    lowest_row = country_records.sort_values("co2", ascending=True).iloc[0]
    total_years = len(country_records)
    share = None
    worlds = load_global_series()
    world_latest = worlds[worlds["year"] == latest_year]
    if not world_latest.empty and float(world_latest["co2"].iloc[0] or 0) > 0:
        share = (latest_value / float(world_latest["co2"].iloc[0] or 0)) * 100

    return {
        "country": country_name,
        "latest_year": latest_year,
        "latest_value": latest_value,
        "first_year": first_year,
        "first_value": first_value,
        "long_term_change": latest_value - first_value,
        "global_share_percent": None if share is None else float(share),
        "highest_recorded_year": int(highest_row["year"]),
        "lowest_recorded_year": int(lowest_row["year"]),
        "history": [
            {"year": int(row["year"]), "co2": float(row["co2"] or 0)}
            for _, row in country_records[["year", "co2"]].drop_duplicates().iterrows()
        ],
        "years_covered": total_years,
    }


@app.get("/api/country/{country_name}/history")
def country_history(country_name: str) -> list[dict[str, Any]]:
    df = load_dataframe()
    country_records = df[df["country"] == country_name].sort_values("year")
    if country_records.empty:
        raise HTTPException(status_code=404, detail=f"Country not found: {country_name}")
    return [
        {"year": int(row["year"]), "co2": float(row["co2"] or 0)}
        for _, row in country_records[["year", "co2"]].drop_duplicates().iterrows()
    ]


@app.get("/api/compare")
def compare_countries(countries: str = Query(...)) -> dict[str, Any]:
    selected = [country.strip() for country in countries.split(",") if country.strip()]
    if not selected:
        return {"series": []}

    df = load_dataframe()
    records = []
    for country in selected:
        country_df = df[df["country"] == country].sort_values("year")
        if country_df.empty:
            continue
        for _, row in country_df[["year", "co2"]].drop_duplicates().iterrows():
            records.append({"country": country, "year": int(row["year"]), "co2": float(row["co2"] or 0)})

    return {"series": records}


@app.get("/api/summary")
def summary() -> dict[str, Any]:
    global_series = load_global_series().sort_values("year")
    latest_year = int(global_series["year"].max())
    latest_value = float(global_series[global_series["year"] == latest_year]["co2"].iloc[0] or 0)
    start_value = float(global_series[global_series["year"] == int(global_series["year"].min())]["co2"].iloc[0] or 0)

    latest_country_rows = list_countries_for_year(latest_year)
    highest_country = latest_country_rows.iloc[0].to_dict() if not latest_country_rows.empty else None

    fastest_growth = []
    for country in sorted(load_dataframe()["country"].dropna().unique()):
        country_series = load_dataframe()[load_dataframe()["country"] == country].sort_values("year")
        if len(country_series) < 2:
            continue
        first_value = float(country_series["co2"].iloc[0] or 0)
        last_value = float(country_series["co2"].iloc[-1] or 0)
        growth = (last_value - first_value) / first_value if first_value > 0 else 0.0
        if growth > 0:
            fastest_growth.append({"country": country, "growth_ratio": float(growth), "start_year": int(country_series["year"].iloc[0]), "end_year": int(country_series["year"].iloc[-1])})
    fastest_growth = sorted(fastest_growth, key=lambda item: item["growth_ratio"], reverse=True)[:5]

    top_emitters = latest_country_rows.head(5).to_dict("records")
    global_trend = "increased substantially since the Industrial Revolution" if latest_value > start_value else "declined over the recorded period"

    return {
        "latest_year": latest_year,
        "latest_global_co2": latest_value,
        "start_year": int(global_series["year"].min()),
        "start_global_co2": start_value,
        "highest_emitting_country": highest_country["country"] if highest_country else None,
        "highest_emitting_value": float(highest_country["co2"]) if highest_country else None,
        "global_trend": global_trend,
        "insights": [
            {
                "title": "Global emissions trend",
                "description": f"Global CO₂ emissions rose from {start_value:,.0f} MtCO₂ in {int(global_series['year'].min())} to {latest_value:,.0f} MtCO₂ in {latest_year}.",
            },
            {
                "title": "Largest emitters",
                "description": "The latest-year ranking is dominated by major industrial economies and large population centers, with the top emitters reflecting both scale and industrial activity.",
            },
            {
                "title": "Fastest historical growth",
                "description": "The dataset shows the strongest relative expansion for countries with rapid industrialization, urbanization, and energy-system transitions over long periods.",
            },
            {
                "title": "Historical peaks",
                "description": "Peak emissions years are visible in the long-run series and vary by country, revealing both policy and economic turning points across the historical record.",
            },
        ],
        "top_emitters": [{"country": item["country"], "co2": float(item["co2"] or 0), "rank": int(item["rank"])} for item in top_emitters],
        "fastest_growth": fastest_growth,
        "coverage": {"start": int(global_series["year"].min()), "end": int(global_series["year"].max())},
    }


@app.get("/api/demo")
def demo_payload() -> dict[str, Any]:
    with PROCESSED_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)
