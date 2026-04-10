"""Fetch BTC/USD daily prices from the free CoinGecko API.

Endpoint:
    GET https://api.coingecko.com/api/v3/coins/bitcoin/market_chart
         ?vs_currency=usd&days=<N>&interval=daily

Returns a pandas Series indexed by date (dtype: datetime64[ns], UTC-naive
calendar date) with USD close prices. Handles 429s with a single retry after
60 seconds and falls back to a shorter window if the free tier refuses the
requested range.
"""

from __future__ import annotations

import time
from typing import Iterable

import pandas as pd
import requests

from .config import BTC_HISTORY_DAYS, BTC_MIN_DAYS, REQUEST_USER_AGENT

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
)


def _request_market_chart(days: int) -> dict:
    """Raw call to CoinGecko market_chart with a single 60s retry on 429."""
    headers = {"User-Agent": REQUEST_USER_AGENT, "accept": "application/json"}
    params = {"vs_currency": "usd", "days": str(days), "interval": "daily"}

    resp = requests.get(COINGECKO_URL, headers=headers, params=params, timeout=30)
    if resp.status_code == 429:
        print(f"[btc] CoinGecko 429; sleeping 60s then retrying days={days}")
        time.sleep(60)
        resp = requests.get(COINGECKO_URL, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_btc_prices(preferred_days: int = BTC_HISTORY_DAYS) -> pd.Series:
    """Return daily BTC/USD closing prices as a pandas Series.

    Tries the preferred window first; if CoinGecko's free tier refuses (HTTP
    error or insufficient rows), falls back progressively until at least
    ``BTC_MIN_DAYS`` rows are returned.
    """
    attempts: Iterable[int] = (preferred_days, 180, 120, 90)
    last_err: Exception | None = None

    for days in attempts:
        try:
            payload = _request_market_chart(days=days)
            prices = payload.get("prices", [])
            if not prices:
                raise ValueError(f"CoinGecko returned empty prices for days={days}")
            # payload["prices"] = list of [ms_timestamp, usd_price]
            df = pd.DataFrame(prices, columns=["ts_ms", "usd"])
            df["date"] = pd.to_datetime(df["ts_ms"], unit="ms", utc=True).dt.tz_localize(None).dt.normalize()
            # CoinGecko can occasionally return two points on the last day (the
            # "current" tick + the daily close). Dedup keeping the last.
            df = df.drop_duplicates(subset="date", keep="last").sort_values("date")
            series = pd.Series(df["usd"].values, index=pd.DatetimeIndex(df["date"]), name="btc_usd")
            # CoinGecko's "daily" market_chart snapshots price at 00:00 UTC,
            # i.e. ~8 hours AFTER a US equity market close (16:00 ET = 20:00 UTC
            # of the previous day). Shift the index back one day so that the
            # label "D" represents the last BTC value observed on trading day D
            # (close of US equity day D).
            series.index = series.index - pd.Timedelta(days=1)
            if len(series) < BTC_MIN_DAYS:
                raise ValueError(
                    f"CoinGecko returned only {len(series)} rows for days={days}, need >= {BTC_MIN_DAYS}"
                )
            print(f"[btc] fetched {len(series)} daily rows for days={days}")
            return series
        except Exception as err:  # noqa: BLE001 — we want to cascade to fallback
            print(f"[btc] days={days} failed: {err}")
            last_err = err
            continue

    raise RuntimeError(
        f"Could not fetch BTC price history with at least {BTC_MIN_DAYS} rows; "
        f"last error: {last_err}"
    )


if __name__ == "__main__":
    s = fetch_btc_prices()
    print(s.tail())
