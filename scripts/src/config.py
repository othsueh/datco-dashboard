"""Shared configuration for the DAT.co data pipeline.

Paths, constants, and the list of tracked companies live here so that every
pipeline stage reads from a single source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

import yaml

# ---------- Paths ----------
# This file lives at scripts/src/config.py — project root is two parents up.
PROJECT_ROOT: Path = Path(__file__).resolve().parents[2]
SCRIPTS_DIR: Path = PROJECT_ROOT / "scripts"
DATA_RAW_DIR: Path = PROJECT_ROOT / "data" / "raw"
HOLDINGS_DIR: Path = DATA_RAW_DIR / "holdings"
COMPANIES_YAML: Path = DATA_RAW_DIR / "companies.yaml"

PUBLIC_DATA_DIR: Path = PROJECT_ROOT / "public" / "data"
PUBLIC_COMPANIES_DIR: Path = PUBLIC_DATA_DIR / "companies"
BTC_PRICE_JSON: Path = PUBLIC_DATA_DIR / "btc_price.json"
SNAPSHOT_JSON: Path = PUBLIC_DATA_DIR / "snapshot.json"

# ---------- Constants ----------
BTC_HISTORY_DAYS: int = 365          # preferred window; fall back if rate-limited
BTC_MIN_DAYS: int = 120              # minimum acceptable history
CORRELATION_WINDOW: int = 30         # rolling 30 trading days
ROUND_CURRENCY: int = 2              # USD rounding
ROUND_RATIO: int = 4                 # mnav / ratio rounding
ROUND_PER_KSHARES: int = 6           # btc_per_kshares rounding
REQUEST_USER_AGENT: str = (
    "DATco-Dashboard/0.1 (+https://github.com/othsueh/DATco_Dashboard; contact: ych930719@gmail.com)"
)


# ---------- Company metadata ----------
@dataclass(frozen=True)
class Company:
    """Metadata for one tracked DAT company."""

    ticker: str            # UPPER-CASE dashboard key, e.g. "MSTR"
    name: str              # display name
    yf_symbol: str         # yfinance symbol (may differ from ticker)
    brand_color: str       # hex color for the frontend


def load_companies() -> List[Company]:
    """Read companies.yaml and return the list of Company objects."""
    with COMPANIES_YAML.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, list):
        raise ValueError(f"Expected a YAML list in {COMPANIES_YAML}, got {type(raw)!r}")
    out: List[Company] = []
    for entry in raw:
        out.append(
            Company(
                ticker=str(entry["ticker"]).upper(),
                name=str(entry["name"]),
                yf_symbol=str(entry["yf_symbol"]),
                brand_color=str(entry["brand_color"]),
            )
        )
    return out
