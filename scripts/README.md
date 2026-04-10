# DAT.co Data Pipeline (Phase B)

Python pipeline that fetches real market data and writes the JSON files the
Next.js app consumes. Managed with [uv](https://docs.astral.sh/uv/).

## What it does

1. Fetches daily BTC/USD prices from the free [CoinGecko](https://www.coingecko.com/en/api) `market_chart` endpoint (~1 year).
2. Fetches daily OHLC + shares-outstanding history from [yfinance](https://github.com/ranaroussi/yfinance) for each tracked DAT company.
3. Reads hand-curated BTC holdings purchase-event CSVs under `data/raw/holdings/`.
4. Computes indicators: **mNAV**, **premium %**, **BTC per 1k shares**, **rolling 30-day correlation** of daily stock vs BTC log-returns.
5. Writes JSON to `public/data/` matching the TypeScript contract in `lib/data.ts`.

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

## Install

```bash
cd scripts
uv sync
```

## Run the full pipeline

```bash
cd scripts
uv run python -m src.run_pipeline
```

This writes / overwrites:

- `public/data/btc_price.json`
- `public/data/companies/{MSTR,MTPLF,MARA,SMLR,RIOT}.json`
- `public/data/snapshot.json`

It does **NOT** touch `public/data/ai_summaries.json` — that file is owned by Phase C.

## Layout

```
scripts/
├── pyproject.toml          # uv / PEP-621 metadata
├── uv.lock                 # committed
├── README.md               # this file
└── src/
    ├── __init__.py
    ├── config.py           # COMPANIES list, paths, constants
    ├── fetch_btc_prices.py
    ├── fetch_stock_prices.py
    ├── load_btc_holdings.py
    ├── compute_indicators.py
    └── run_pipeline.py     # orchestrator (entry point)

data/raw/
├── companies.yaml          # ticker -> name, yf_symbol, brand_color
└── holdings/
    ├── MSTR.csv            # date,btc_total,source_url
    ├── MTPLF.csv
    ├── MARA.csv
    ├── SMLR.csv
    └── RIOT.csv
```

## Data source caveats

- The holdings CSVs are **hand-curated approximations** seeded for MVP purposes.
  The _final_ cumulative BTC total per company targets reality for early 2026;
  intermediate purchase dates/totals are illustrative and should not be relied
  on for analysis. See the report for the full caveat.
- `yfinance` can rate-limit or return empty shares history for OTC tickers
  (notably MTPLF). The pipeline falls back to `Ticker.info["sharesOutstanding"]`
  as a flat series and logs the `shares_source`.
- The CoinGecko free tier is used with no auth; if it starts refusing 365d,
  the fetcher automatically falls back to 180 / 120 / 90 days (minimum 120).
