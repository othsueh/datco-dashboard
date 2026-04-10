"""Fetch daily OHLC + shares-outstanding history per ticker from yfinance.

We pull ~1 year of daily closes and then try to fetch a historical shares
series via ``Ticker.get_shares_full``. When that is unavailable (common for
OTC tickers and some smaller caps), we fall back to a flat series built from
``Ticker.info["sharesOutstanding"]``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd
import yfinance as yf


@dataclass
class StockHistory:
    ticker: str
    yf_symbol: str
    close: pd.Series              # index: date (tz-naive), values: USD close
    shares_outstanding: pd.Series  # index: date (tz-naive), values: float
    shares_source: str            # "get_shares_full" | "info_fallback" | "stub"


def _normalize_index(idx: pd.Index) -> pd.DatetimeIndex:
    """Strip timezone info and time-of-day; return pure calendar-day index."""
    dti = pd.DatetimeIndex(idx)
    if dti.tz is not None:
        dti = dti.tz_convert("UTC").tz_localize(None)
    return dti.normalize()


def _fetch_close(symbol: str) -> pd.Series:
    tk = yf.Ticker(symbol)
    hist = tk.history(period="1y", interval="1d", auto_adjust=False)
    if hist.empty:
        raise RuntimeError(f"yfinance returned empty history for {symbol}")
    close = hist["Close"].copy()
    close.index = _normalize_index(close.index)
    close.name = "close"
    # Drop any exact-duplicate index rows (very rare, keep last).
    close = close[~close.index.duplicated(keep="last")]
    return close.astype(float)


def _fetch_shares_history(symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> Optional[pd.Series]:
    """Try yfinance's historical shares-outstanding series."""
    tk = yf.Ticker(symbol)
    try:
        raw = tk.get_shares_full(start=start.to_pydatetime(), end=end.to_pydatetime())
    except Exception as err:  # noqa: BLE001
        print(f"[stock:{symbol}] get_shares_full failed: {err}")
        return None
    if raw is None or len(raw) == 0:
        return None
    series = pd.Series(raw)
    series.index = _normalize_index(series.index)
    series = series[~series.index.duplicated(keep="last")].sort_index()
    return series.astype(float)


def _fetch_shares_info(symbol: str) -> Optional[float]:
    tk = yf.Ticker(symbol)
    try:
        info = tk.info or {}
    except Exception as err:  # noqa: BLE001
        print(f"[stock:{symbol}] info fetch failed: {err}")
        return None
    for key in ("sharesOutstanding", "impliedSharesOutstanding", "floatShares"):
        val = info.get(key)
        if val:
            return float(val)
    return None


def fetch_stock_history(ticker: str, yf_symbol: str) -> StockHistory:
    """Fetch OHLC + shares outstanding for one ticker, aligned to trading days."""
    close = _fetch_close(yf_symbol)

    start = close.index.min()
    end = close.index.max() + pd.Timedelta(days=1)

    shares_hist = _fetch_shares_history(yf_symbol, start, end)
    if shares_hist is not None and len(shares_hist) > 0:
        # Reindex to the close index and forward/backfill. Use nearest
        # forward-fill first, then backfill the early days so we have no NaNs.
        aligned = (
            shares_hist.reindex(close.index.union(shares_hist.index))
            .sort_index()
            .ffill()
            .reindex(close.index)
            .ffill()
            .bfill()
        )
        source = "get_shares_full"
    else:
        shares_const = _fetch_shares_info(yf_symbol)
        if shares_const is None:
            raise RuntimeError(
                f"[stock:{yf_symbol}] no shares data from get_shares_full or info"
            )
        aligned = pd.Series([shares_const] * len(close), index=close.index)
        source = "info_fallback"

    aligned.name = "shares_outstanding"
    return StockHistory(
        ticker=ticker,
        yf_symbol=yf_symbol,
        close=close,
        shares_outstanding=aligned.astype(float),
        shares_source=source,
    )


if __name__ == "__main__":
    h = fetch_stock_history("MSTR", "MSTR")
    print(h.close.tail())
    print("shares source:", h.shares_source)
    print(h.shares_outstanding.tail())
