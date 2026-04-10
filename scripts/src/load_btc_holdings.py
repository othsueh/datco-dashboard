"""Load hand-curated BTC purchase-event CSVs and forward-fill to a daily series.

Each CSV under data/raw/holdings/<TICKER>.csv has columns:
    date,btc_total,source_url

Rows represent cumulative (post-event) holdings on the given date. Lines
beginning with '#' are treated as comments and skipped.
"""

from __future__ import annotations

import pandas as pd

from .config import HOLDINGS_DIR


def load_holdings(ticker: str) -> pd.DataFrame:
    """Return the raw event-level DataFrame for a ticker, sorted by date."""
    path = HOLDINGS_DIR / f"{ticker.upper()}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Holdings CSV missing: {path}")
    df = pd.read_csv(path, comment="#")
    required = {"date", "btc_total"}
    if not required.issubset(df.columns):
        raise ValueError(
            f"{path} must have columns {sorted(required)}; got {list(df.columns)}"
        )
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    df = df.sort_values("date").reset_index(drop=True)
    df["btc_total"] = df["btc_total"].astype(float)
    return df


def daily_holdings_series(ticker: str, index: pd.DatetimeIndex) -> pd.Series:
    """Return a daily btc_total Series aligned to ``index``.

    Dates before the first purchase event are dropped (NaN) because the
    company had no BTC treasury yet. Dates after the last event carry the
    last-known total forward (buy-and-hold assumption).
    """
    events = load_holdings(ticker)
    events = events.set_index("date")["btc_total"]

    # Build a daily calendar over the union of the stock index and event dates
    # so forward-fill covers every requested day.
    all_days = pd.DatetimeIndex(sorted(set(index).union(events.index)))
    daily = events.reindex(all_days).ffill()

    aligned = daily.reindex(index)
    first_event_date = events.index.min()
    aligned = aligned[aligned.index >= first_event_date]
    aligned.name = "btc_holdings"
    return aligned.astype(float)


if __name__ == "__main__":
    idx = pd.date_range("2025-01-01", "2026-04-10", freq="D")
    s = daily_holdings_series("MSTR", idx)
    print(s.tail())
