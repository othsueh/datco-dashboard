"""Assemble per-company daily DataFrames and compute the dashboard indicators.

Indicators
----------
mnav            = market_cap / (btc_holdings * btc_price)
premium_pct     = (mnav - 1) * 100
btc_per_kshares = (btc_holdings / shares_outstanding) * 1000
corr_30d        = rolling 30-day Pearson corr of stock_returns vs btc_returns
                  (NaN for the first 29 rows; emitted as JSON null)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import (
    CORRELATION_WINDOW,
    ROUND_CURRENCY,
    ROUND_PER_KSHARES,
    ROUND_RATIO,
)
from .fetch_stock_prices import StockHistory
from .load_btc_holdings import daily_holdings_series


@dataclass
class CompanySeries:
    ticker: str
    frame: pd.DataFrame   # columns listed in COLUMNS below


COLUMNS = [
    "close",
    "market_cap",
    "shares_outstanding",
    "btc_holdings",
    "btc_price",
    "mnav",
    "premium_pct",
    "btc_per_kshares",
    "corr_30d",
]


def build_company_frame(
    stock: StockHistory,
    btc_prices: pd.Series,
) -> pd.DataFrame:
    """Inner-join stock & BTC on trading days, then join holdings and compute indicators."""
    # Align close + btc on the intersection of trading days (no weekends/holidays).
    aligned = pd.concat(
        [
            stock.close.rename("close"),
            stock.shares_outstanding.rename("shares_outstanding"),
            btc_prices.rename("btc_price"),
        ],
        axis=1,
        join="inner",
    )
    aligned = aligned.dropna(subset=["close", "btc_price"])
    if aligned.empty:
        raise ValueError(f"No overlapping trading days for {stock.ticker}")

    # Holdings: daily series on the aligned trading-day index.
    holdings = daily_holdings_series(stock.ticker, aligned.index)
    aligned = aligned.join(holdings, how="inner")
    aligned = aligned.dropna(subset=["btc_holdings"])

    if aligned.empty:
        raise ValueError(
            f"No rows for {stock.ticker} after aligning holdings — "
            f"check holdings CSV first event date"
        )

    # Derived columns.
    aligned["market_cap"] = aligned["close"] * aligned["shares_outstanding"]
    nav = aligned["btc_holdings"] * aligned["btc_price"]
    aligned["mnav"] = aligned["market_cap"] / nav
    aligned["premium_pct"] = (aligned["mnav"] - 1.0) * 100.0
    aligned["btc_per_kshares"] = (
        aligned["btc_holdings"] / aligned["shares_outstanding"]
    ) * 1000.0

    # Rolling 30-day correlation of daily log returns. We fill the very
    # first return with 0 (the stub generator does the same) so that a
    # window of 30 rows yields the first non-null correlation at index 29,
    # matching the "null for the first 29 days" contract in lib/data.ts.
    stock_ret = np.log(aligned["close"]).diff().fillna(0.0)
    btc_ret = np.log(aligned["btc_price"]).diff().fillna(0.0)
    aligned["corr_30d"] = stock_ret.rolling(window=CORRELATION_WINDOW).corr(btc_ret)

    # Reorder to the canonical column list. The index stays the datetime.
    return aligned[COLUMNS]


def frame_to_series_records(frame: pd.DataFrame) -> list[dict]:
    """Convert the per-company DataFrame into JSON-serializable rows.

    Rules from the TS contract:
      - dates ISO YYYY-MM-DD
      - corr_30d must be None (JSON null) for the first 29 rows
      - dollars rounded to 2 decimals, ratios to 4, btc_per_kshares to 6
    """
    records: list[dict] = []
    for ts, row in frame.iterrows():
        corr = row["corr_30d"]
        corr_val = None
        if pd.notna(corr):
            corr_val = round(float(corr), ROUND_RATIO)

        record = {
            "date": pd.Timestamp(ts).strftime("%Y-%m-%d"),
            "close": round(float(row["close"]), ROUND_CURRENCY),
            "market_cap": round(float(row["market_cap"]), ROUND_CURRENCY),
            "shares_outstanding": int(round(float(row["shares_outstanding"]))),
            "btc_holdings": int(round(float(row["btc_holdings"]))),
            "btc_price": round(float(row["btc_price"]), ROUND_CURRENCY),
            "mnav": round(float(row["mnav"]), ROUND_RATIO),
            "premium_pct": round(float(row["premium_pct"]), ROUND_CURRENCY),
            "btc_per_kshares": round(
                float(row["btc_per_kshares"]), ROUND_PER_KSHARES
            ),
            "corr_30d": corr_val,
        }
        records.append(record)
    return records
