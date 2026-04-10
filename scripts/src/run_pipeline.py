"""Orchestrate the DAT.co data pipeline end-to-end.

Steps
-----
1. Fetch BTC daily prices (CoinGecko).
2. For each company in companies.yaml:
     a. Fetch stock OHLC + shares outstanding (yfinance)
     b. Load holdings CSV
     c. Compute indicators (mNAV, premium %, btc/kshares, 30d corr)
     d. Write public/data/companies/<TICKER>.json
3. Write public/data/btc_price.json (union of all dates where BTC is known).
4. Write public/data/snapshot.json from the "latest" row of each company.
5. Generate Claude-authored AI summaries into public/data/ai_summaries.json.
   This step runs LAST so it always sees fresh company JSON. Any failure here
   is logged but does NOT take down the pipeline — existing summaries on disk
   are preserved.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List

import pandas as pd

from .compute_indicators import (
    build_company_frame,
    frame_to_series_records,
)
from .config import (
    BTC_PRICE_JSON,
    PUBLIC_COMPANIES_DIR,
    PUBLIC_DATA_DIR,
    ROUND_CURRENCY,
    SNAPSHOT_JSON,
    load_companies,
)
from .fetch_btc_prices import fetch_btc_prices
from .fetch_stock_prices import fetch_stock_history


def _ensure_dirs() -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_COMPANIES_DIR.mkdir(parents=True, exist_ok=True)


def _dump_json(path, payload: dict | list) -> None:
    # allow_nan=False guards against accidental NaN leakage — we replace with
    # None explicitly upstream (see frame_to_series_records).
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, allow_nan=False)
        fh.write("\n")


def _write_btc_price(btc: pd.Series) -> None:
    dates = [pd.Timestamp(d).strftime("%Y-%m-%d") for d in btc.index]
    prices = [round(float(v), ROUND_CURRENCY) for v in btc.values]
    _dump_json(BTC_PRICE_JSON, {"dates": dates, "prices": prices})
    print(f"[write] {BTC_PRICE_JSON.relative_to(PUBLIC_DATA_DIR.parent.parent)} "
          f"({len(dates)} days)")


def _write_company(company, series_records: List[dict], now_iso: str) -> dict:
    payload = {
        "ticker": company.ticker,
        "name": company.name,
        "yf_symbol": company.yf_symbol,
        "brand_color": company.brand_color,
        "series": series_records,
        "latest": series_records[-1],
        "last_updated": now_iso,
    }
    out_path = PUBLIC_COMPANIES_DIR / f"{company.ticker}.json"
    _dump_json(out_path, payload)
    print(
        f"[write] {out_path.relative_to(PUBLIC_DATA_DIR.parent.parent)} "
        f"({len(series_records)} rows, latest mnav={payload['latest']['mnav']})"
    )
    return payload


def _write_snapshot(company_payloads: List[dict], btc_latest: float, now_iso: str) -> None:
    rows = []
    total_btc = 0
    for c in company_payloads:
        latest = c["latest"]
        total_btc += int(latest["btc_holdings"])
        rows.append(
            {
                "ticker": c["ticker"],
                "name": c["name"],
                "brand_color": c["brand_color"],
                "price": latest["close"],
                "mnav": latest["mnav"],
                "premium_pct": latest["premium_pct"],
                "btc_holdings": int(latest["btc_holdings"]),
                "corr_30d": latest["corr_30d"],
            }
        )
    payload = {
        "generated_at": now_iso,
        "btc_price": round(float(btc_latest), ROUND_CURRENCY),
        "total_btc_tracked": total_btc,
        "rows": rows,
    }
    _dump_json(SNAPSHOT_JSON, payload)
    print(f"[write] snapshot.json ({len(rows)} companies, total_btc={total_btc})")


def main() -> None:
    _ensure_dirs()
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    print("[pipeline] Step 1 — fetch BTC prices")
    btc = fetch_btc_prices()

    companies = load_companies()
    print(f"[pipeline] Step 2 — fetch stock + compute indicators for "
          f"{len(companies)} tickers: {[c.ticker for c in companies]}")

    company_payloads: List[dict] = []
    for company in companies:
        try:
            stock = fetch_stock_history(company.ticker, company.yf_symbol)
        except Exception as err:  # noqa: BLE001
            print(f"[stock:{company.ticker}] fetch failed: {err}")
            raise

        frame = build_company_frame(stock, btc)
        series_records = frame_to_series_records(frame)
        if len(series_records) == 0:
            raise RuntimeError(
                f"{company.ticker}: no rows after alignment — check holdings CSV"
            )
        payload = _write_company(company, series_records, now_iso)
        company_payloads.append(payload)

    print("[pipeline] Step 3 — write btc_price.json")
    # Only emit BTC history for dates that appear in at least one company's
    # trading calendar; this keeps the file aligned with what the frontend
    # will plot against. Fall back to the full BTC series if empty.
    trading_days = sorted(
        {pd.Timestamp(r["date"]) for c in company_payloads for r in c["series"]}
    )
    if trading_days:
        btc_trimmed = btc.reindex(pd.DatetimeIndex(trading_days)).ffill().dropna()
    else:
        btc_trimmed = btc
    _write_btc_price(btc_trimmed)

    print("[pipeline] Step 4 — write snapshot.json")
    btc_latest = float(btc_trimmed.iloc[-1]) if len(btc_trimmed) else float(btc.iloc[-1])
    _write_snapshot(company_payloads, btc_latest, now_iso)

    print("[pipeline] Step 5 — generate AI summaries")
    try:
        # Imported lazily so any anthropic-SDK import issues do not break
        # the earlier (more important) data-fetch steps.
        from .generate_ai_summaries import main as generate_ai_summaries

        rc = generate_ai_summaries()
        if rc != 0:
            print(f"[pipeline] AI summary step returned non-zero ({rc}) — continuing")
    except Exception as err:  # noqa: BLE001
        print(f"[pipeline] AI summary step FAILED (non-fatal): {err}")

    print("[pipeline] done.")


if __name__ == "__main__":
    main()
