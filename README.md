# DATco Dashboard

A web-based monitor for **Digital Asset Treasury (DAT)** companies — public
equities whose balance sheets are heavily allocated to Bitcoin. The dashboard
tracks **mNAV**, premium-to-NAV, and rolling 30-day correlation with BTC for
MSTR, MTPLF, MARA, SMLR, and RIOT, with daily-frequency time series and
AI-generated summaries.

This repository doubles as the assignment report; see the three required
sections below.

---

## 1. Selected Indicator — mNAV (Modified / Market NAV Multiple)

**Definition.**

```
mNAV = market_cap / (btc_holdings * btc_price_usd)
```

where `market_cap = shares_outstanding * close_price`. A value of `1.0x`
means the equity trades exactly in line with the USD value of the BTC it
holds. Values above `1.0x` mean the market is paying a **premium** for
equity-wrapped BTC exposure; values below `1.0x` mean a **discount**.

**Why this indicator.** Of the candidates in the assignment (mNAV, premium /
discount to NAV, ETF flows, geopolitical events, Fed policy, miners' support
line), mNAV is the best fit for a 1-week MVP:

- **Canonical.** It is the yardstick the DAT community uses to argue about
  whether Strategy, Metaplanet, Riot, etc. are rich or cheap. Every research
  note in the space quotes mNAV.
- **Fully reconstructible from public data.** Three inputs are enough:
  share count and stock close (Yahoo Finance via `yfinance`), BTC/USD
  (CoinGecko), and BTC held by the company (IR pages / 8-Ks, tracked in
  `data/raw/holdings/*.csv`). No paid feeds, no scraping of
  JavaScript-heavy sites.
- **Comparable across companies.** Because it normalises by BTC value, a
  single chart can stack MSTR, Metaplanet, and the miners on the same
  y-axis.
- **Extensible.** Premium % (`mNAV − 1`) and rolling correlation with BTC
  fall out of the same dataset for free.

---

## 2. Relationship with Bitcoin (BTC)

### 2.1 How the indicator is mathematically tied to BTC

By construction, BTC price is in the denominator of mNAV:

```
mNAV_t = (shares_t * close_t) / (btc_holdings_t * btc_price_t)
```

Hold `shares_t` and `btc_holdings_t` constant over a short window and
differentiate:

- If BTC rallies and the stock rallies at the **same percentage**, mNAV
  stays flat — the premium is unchanged.
- If BTC rallies **faster** than the stock (market is cautious on
  reflexivity), mNAV **contracts** toward 1.0x.
- If the stock rallies **faster** than BTC (market prices in leverage,
  future issuance, treasury strategy brand), mNAV **expands**.

So mNAV is a direct read on the market's **relative enthusiasm for the
equity wrapper versus holding spot BTC**.

### 2.2 Hypothesis

**Reflexivity premium.** When BTC sentiment is high, pure-DAT equities
(MSTR, MTPLF) tend to trade at an elevated mNAV because investors are
paying for: (a) the optionality of future BTC purchases funded via
equity/debt issuance, (b) brand and conviction signalling by management,
(c) a levered proxy in accounts that cannot hold spot BTC directly.
Conversely, in drawdowns mNAV compresses quickly because the levered
premium is the first thing to be repriced.

**Business-mix dilution.** Mining-heavy names like **MARA** and **RIOT**
carry BTC treasuries, but their equity is also tied to hash rate, energy
costs, and ASIC capex cycles. We expect them to show a **noticeably lower
30-day correlation with BTC** than pure DATs, and mNAV readings that are
harder to interpret in isolation.

### 2.3 What the current snapshot shows

Values below are read directly from
[`public/data/snapshot.json`](public/data/snapshot.json) (BTC =
$71,724.38 at snapshot time):

| Ticker | Company                       | mNAV  | Premium  | 30d corr w/ BTC |
| ------ | ----------------------------- | ----- | -------- | --------------- |
| RIOT   | Riot Platforms                | 5.14x | +413.66% | 0.55            |
| SMLR   | Strive (ex-Semler Scientific) | 1.85x | +85.26%  | 0.60            |
| MSTR   | Strategy Inc.                 | 1.38x | +37.92%  | **0.76**        |
| MTPLF  | Metaplanet Inc.               | 1.19x | +19.47%  | 0.63            |
| MARA   | MARA Holdings                 | 1.05x | +4.62%   | 0.32            |

A few observations consistent with the hypothesis:

- **MSTR has the strongest BTC correlation (0.76)** and a moderate
  premium — it is the market's reference pure-DAT. MTPLF, the Japanese
  pure DAT, is the second-most-correlated (0.63).
- **MARA has the weakest correlation (0.32)** despite holding 49,000 BTC,
  consistent with the "mining business mix dilutes the BTC signal"
  hypothesis.
- **RIOT's 5.14x mNAV is misleading in isolation** — the equity value is
  mostly pricing the mining operation, not the 17,175 BTC on the balance
  sheet. This is exactly the caveat the dashboard surfaces on its detail
  page.
- **SMLR's 1.85x** reflects the Strive merger rather than a pure treasury
  premium and is flagged as such in the UI.

The `/company/<ticker>` page shows these time-series individually and the
`/compare` page lets the user overlay them on a single mNAV axis.

---

## 3. Deployed Website URL

**TBD — deployment planned via Vercel.**

The site is a standard Next.js 16 app and will be deployed via Vercel's
one-click GitHub import. After the first deploy this URL should be pasted
back into this section.

> Placeholder: `https://<your-vercel-project>.vercel.app/`

---

## How it works

```
          ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐
          │  CoinGecko   │    │ Yahoo Finance│    │  Company IR / 8-K  │
          │  (BTC/USD)   │    │  (yfinance)  │    │  (BTC holdings CSV)│
          └──────┬───────┘    └───────┬──────┘    └─────────┬──────────┘
                 │                    │                     │
                 └────────┬───────────┴─────────────────────┘
                          │
                  ┌───────▼────────┐
                  │ Python pipeline │  uv-managed, scripts/src/*
                  │  (pandas,       │  - fetch_btc_prices.py
                  │   yfinance,     │  - fetch_stock_prices.py
                  │   anthropic)    │  - load_btc_holdings.py
                  └───────┬─────────┘  - compute_indicators.py
                          │            - generate_ai_summaries.py
                          │            - run_pipeline.py
                  ┌───────▼─────────┐
                  │ public/data/*.json
                  │  - snapshot.json
                  │  - btc_price.json
                  │  - companies/<TICKER>.json
                  │  - ai_summaries.json
                  └───────┬─────────┘
                          │
                  ┌───────▼─────────┐
                  │  Next.js 16 app │  App Router, RSC, Recharts
                  │  (this repo)    │  reads JSON at build/request
                  └─────────────────┘
```

The frontend never talks to CoinGecko, Yahoo, or Anthropic at runtime — it
reads static JSON from `public/data/`. A nightly GitHub Action re-runs the
pipeline and commits the refreshed JSON, which triggers a Vercel redeploy.

---

## Data sources

| Source                                                     | Used for                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| [CoinGecko](https://www.coingecko.com/en/coins/bitcoin)    | BTC/USD daily close                                                   |
| [Yahoo Finance](https://finance.yahoo.com/) via `yfinance` | Stock close price and shares outstanding per ticker                   |
| Company IR pages and 8-K filings                           | BTC holdings events per company (`data/raw/holdings/*.csv`)           |
| [Anthropic Claude](https://www.anthropic.com/claude)       | Per-company narrative summaries (with a deterministic local fallback) |

---

## Caveats

- **SMLR / Strive.** Semler Scientific merged with Strive in 2025 and now
  trades as **ASST**. The SMLR series is kept for historical continuity
  and is flagged in the UI; treat mNAV readings as a legacy reference.
- **RIOT.** Riot is a **mining-heavy** operator, not a pure digital asset
  treasury. Its mNAV reflects mining economics (hash rate, energy costs,
  ASIC cycles) as much as BTC holdings, and its BTC correlation is
  expected to be weaker than the pure DATs.
- **MARA.** Same caveat class as RIOT — expect decoupling from BTC during
  mining-cycle news.
- **BTC holdings CSVs are approximations.** Holdings are event-sourced
  from 8-Ks / press releases and forward-filled between events. Small
  additions between filings may not be captured until the next public
  disclosure.
- **Not investment advice.** Informational and educational use only.

---

## Local development

### Frontend (Next.js 16)

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

The app reads exclusively from `public/data/*.json`, so you can run it
without any Python setup as long as those files exist (they are
version-controlled).

### Data pipeline (Python, uv)

```bash
cd scripts
uv sync
uv run python -m src.run_pipeline
```

This fetches fresh BTC + stock prices, computes mNAV/premium/correlation,
writes `public/data/*.json`, and (if `ANTHROPIC_API_KEY` is set) regenerates
`ai_summaries.json`. If the key is not set, the pipeline falls back to a
deterministic local summary so builds never break.

---

## Auto refresh

A GitHub Action at
[`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml)
runs nightly at **07:00 UTC** (shortly after US market close) and on manual
`workflow_dispatch`. It:

1. Checks out the repo.
2. Sets up Python 3.12 and uv.
3. Runs `uv sync --frozen && uv run python -m src.run_pipeline`.
4. Commits any changes under `public/data/` and `data/raw/` back to the
   default branch (skipping cleanly if nothing changed).

`ANTHROPIC_API_KEY` is passed through from repository secrets when present;
the pipeline tolerates its absence.

---

## Repository layout

```
app/                    Next.js App Router pages (RSC)
  page.tsx              Overview + snapshot table + sparklines
  company/[ticker]/     Per-company detail (charts + AI summary)
  compare/              Cross-company mNAV overlay
  layout.tsx            Root layout, metadata, footer
  icon.svg              Favicon (Bitcoin orange)
components/
  charts/               Recharts client components
  ui/                   shadcn-style primitives
lib/
  data.ts               Server-only JSON loaders + TypeScript contract
  caveats.ts            Per-ticker caveats surfaced in the UI
public/data/
  snapshot.json         Latest cross-company snapshot
  btc_price.json        BTC/USD daily series
  ai_summaries.json     Per-ticker markdown summaries
  companies/<T>.json    Per-company daily series
scripts/                Python data pipeline (uv)
  src/
    run_pipeline.py
    fetch_btc_prices.py
    fetch_stock_prices.py
    load_btc_holdings.py
    compute_indicators.py
    generate_ai_summaries.py
.github/workflows/
  refresh-data.yml      Nightly data refresh
```
