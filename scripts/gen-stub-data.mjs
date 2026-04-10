// Generate stub JSON data for Phase A development.
// This script is NOT part of the runtime app. The Python pipeline in Phase B
// will replace the JSON output with real data matching the exact same schema.
//
// Usage: node scripts/gen-stub-data.mjs

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "public", "data");
const COMPANIES_DIR = path.join(DATA_DIR, "companies");

// Deterministic PRNG so stub numbers are stable across runs.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Produce last N daily dates, ending at a fixed anchor (2026-04-10)
// so stub data is reproducible regardless of when the script is run.
function lastNDates(n) {
  const anchor = new Date("2026-04-10T00:00:00Z");
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(isoDate(d));
  }
  return out;
}

// BTC price: random walk around ~68k with small daily drift.
function generateBtcPrices(dates, seed) {
  const rand = mulberry32(seed);
  const prices = [];
  let p = 68000;
  for (let i = 0; i < dates.length; i++) {
    const shock = (rand() - 0.5) * 0.04; // +/-2% daily
    p = p * (1 + shock);
    prices.push(Number(p.toFixed(2)));
  }
  return prices;
}

// Rolling 30-day Pearson correlation of daily log returns.
function rollingCorr(aReturns, bReturns, window) {
  const out = new Array(aReturns.length).fill(null);
  for (let i = window - 1; i < aReturns.length; i++) {
    const aSlice = aReturns.slice(i - window + 1, i + 1);
    const bSlice = bReturns.slice(i - window + 1, i + 1);
    const meanA = aSlice.reduce((s, v) => s + v, 0) / window;
    const meanB = bSlice.reduce((s, v) => s + v, 0) / window;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let k = 0; k < window; k++) {
      const da = aSlice[k] - meanA;
      const db = bSlice[k] - meanB;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    const denom = Math.sqrt(denA * denB);
    out[i] = denom === 0 ? 0 : Number((num / denom).toFixed(4));
  }
  return out;
}

function logReturns(series) {
  const out = [0];
  for (let i = 1; i < series.length; i++) {
    out.push(Math.log(series[i] / series[i - 1]));
  }
  return out;
}

function generateCompanySeries({
  ticker,
  name,
  yfSymbol,
  brandColor,
  baseClose,
  baseShares,
  baseBtc,
  targetMnav,
  correlationWithBtc, // 0..1 — how tightly the stock tracks BTC
  seed,
}) {
  const dates = lastNDates(60);
  const btcPrices = generateBtcPrices(dates, seed);
  const rand = mulberry32(seed + 777);

  // Stock close: correlated with BTC moves plus idiosyncratic noise.
  const closes = [baseClose];
  for (let i = 1; i < dates.length; i++) {
    const btcRet = Math.log(btcPrices[i] / btcPrices[i - 1]);
    const idio = (rand() - 0.5) * 0.05;
    const stockRet =
      correlationWithBtc * btcRet + (1 - correlationWithBtc) * idio;
    closes.push(Number((closes[i - 1] * Math.exp(stockRet)).toFixed(2)));
  }

  // Shares outstanding: tiny upward drift (dilution from ATM offerings).
  const shares = dates.map((_, i) =>
    Math.round(baseShares * (1 + i * 0.0008 + rand() * 0.0002)),
  );

  // BTC holdings: step up occasionally (simulated purchase events).
  const btcHoldings = [];
  let hold = baseBtc;
  for (let i = 0; i < dates.length; i++) {
    if (i > 0 && rand() < 0.08) {
      hold += Math.round(baseBtc * 0.01 + rand() * baseBtc * 0.015);
    }
    btcHoldings.push(hold);
  }

  // Market cap and mNAV derive from the above, then scale close so mNAV
  // centres near targetMnav. This gives us realistic-looking numbers without
  // hand-tuning each ticker.
  const rawSeries = dates.map((date, i) => {
    const marketCap = closes[i] * shares[i];
    const nav = btcHoldings[i] * btcPrices[i];
    const mnav = marketCap / nav;
    return { date, close: closes[i], marketCap, mnav, nav };
  });

  const avgMnav = rawSeries.reduce((s, r) => s + r.mnav, 0) / rawSeries.length;
  const scale = targetMnav / avgMnav;
  const scaledCloses = closes.map((c) => Number((c * scale).toFixed(2)));

  const stockReturns = logReturns(scaledCloses);
  const btcReturns = logReturns(btcPrices);
  const corr30 = rollingCorr(stockReturns, btcReturns, 30);

  const series = dates.map((date, i) => {
    const close = scaledCloses[i];
    const marketCap = close * shares[i];
    const nav = btcHoldings[i] * btcPrices[i];
    const mnav = Number((marketCap / nav).toFixed(4));
    const premiumPct = Number(((mnav - 1) * 100).toFixed(2));
    const btcPerKshares = Number(
      ((btcHoldings[i] / shares[i]) * 1000).toFixed(6),
    );
    return {
      date,
      close,
      market_cap: Number(marketCap.toFixed(2)),
      shares_outstanding: shares[i],
      btc_holdings: btcHoldings[i],
      btc_price: btcPrices[i],
      mnav,
      premium_pct: premiumPct,
      btc_per_kshares: btcPerKshares,
      corr_30d: corr30[i],
    };
  });

  return {
    ticker,
    name,
    yf_symbol: yfSymbol,
    brand_color: brandColor,
    series,
    latest: series[series.length - 1],
    last_updated: new Date("2026-04-10T07:00:00Z").toISOString(),
  };
}

const COMPANIES = [
  {
    ticker: "MSTR",
    name: "Strategy Inc.",
    yfSymbol: "MSTR",
    brandColor: "#f97316", // orange
    baseClose: 1600,
    baseShares: 18_000_000,
    baseBtc: 214_000,
    targetMnav: 1.9,
    correlationWithBtc: 0.75,
    seed: 101,
  },
  {
    ticker: "MTPLF",
    name: "Metaplanet Inc.",
    yfSymbol: "MTPLF",
    brandColor: "#22d3ee", // cyan
    baseClose: 12,
    baseShares: 600_000_000,
    baseBtc: 4_200,
    targetMnav: 2.3,
    correlationWithBtc: 0.68,
    seed: 202,
  },
  {
    ticker: "MARA",
    name: "MARA Holdings",
    yfSymbol: "MARA",
    brandColor: "#a855f7", // purple
    baseClose: 18,
    baseShares: 320_000_000,
    baseBtc: 42_000,
    targetMnav: 1.05,
    correlationWithBtc: 0.82,
    seed: 303,
  },
];

async function main() {
  await fs.mkdir(COMPANIES_DIR, { recursive: true });

  // --- BTC price series (shared across companies) ---
  const btcDates = lastNDates(60);
  const btcPrices = generateBtcPrices(btcDates, 9999);
  await fs.writeFile(
    path.join(DATA_DIR, "btc_price.json"),
    JSON.stringify({ dates: btcDates, prices: btcPrices }, null, 2),
  );

  // --- Per-company series ---
  const companyData = COMPANIES.map((c) => generateCompanySeries(c));
  for (const c of companyData) {
    await fs.writeFile(
      path.join(COMPANIES_DIR, `${c.ticker}.json`),
      JSON.stringify(c, null, 2),
    );
  }

  // --- Snapshot (overview table) ---
  const totalBtc = companyData.reduce((s, c) => s + c.latest.btc_holdings, 0);
  const snapshot = {
    generated_at: new Date("2026-04-10T07:00:00Z").toISOString(),
    btc_price: btcPrices[btcPrices.length - 1],
    total_btc_tracked: totalBtc,
    rows: companyData.map((c) => ({
      ticker: c.ticker,
      name: c.name,
      brand_color: c.brand_color,
      price: c.latest.close,
      mnav: c.latest.mnav,
      premium_pct: c.latest.premium_pct,
      btc_holdings: c.latest.btc_holdings,
      corr_30d: c.latest.corr_30d,
    })),
  };
  await fs.writeFile(
    path.join(DATA_DIR, "snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );

  // --- AI summaries (placeholder markdown) ---
  const aiSummaries = {
    MSTR: `**Strategy Inc. (MSTR)** — over the last 30 trading days MSTR's mNAV drifted between roughly **1.7x** and **2.1x**, reflecting the market's enduring willingness to pay a sizeable premium for BTC exposure wrapped in an equity. Stock returns show a ~0.75 rolling correlation with BTC, consistent with MSTR behaving as a levered bitcoin proxy. No new disclosed purchases in the window. *This is stub text — real summaries will be generated by the Phase B pipeline using the Anthropic SDK.*`,
    MTPLF: `**Metaplanet (MTPLF)** is trading at the richest mNAV in the cohort (~**2.3x**), reflecting its early-mover narrative in the Japanese DAT space and a smaller float. Correlation with BTC remains moderate (~0.68), suggesting idiosyncratic catalysts (ATM issuance, JPY moves) still drive a meaningful share of daily variance. *Stub placeholder — the Python pipeline will replace this with a Claude-generated narrative.*`,
    MARA: `**MARA Holdings** — mNAV hovering near **1.0x**, i.e. the equity is roughly pricing its BTC treasury at book. That's unusual among DAT names and reflects MARA's operating business (mining) offsetting the treasury premium. BTC correlation is the highest in the cohort (~0.82) because hash-price economics tie revenue directly to BTC/USD. *Placeholder content — will be regenerated from real data in Phase B.*`,
  };
  await fs.writeFile(
    path.join(DATA_DIR, "ai_summaries.json"),
    JSON.stringify(aiSummaries, null, 2),
  );

  console.log("Stub data written to", DATA_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
