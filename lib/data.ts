import { promises as fs } from "fs";
import path from "path";

// ---------- Types (the contract) ----------

export type DailyPoint = {
  date: string; // ISO "YYYY-MM-DD"
  close: number; // stock close price, USD
  market_cap: number; // USD
  shares_outstanding: number;
  btc_holdings: number; // forward-filled
  btc_price: number; // BTC/USD same day
  mnav: number;
  premium_pct: number;
  btc_per_kshares: number;
  corr_30d: number | null; // null for first 30 days
};

export type CompanySeries = {
  ticker: string; // "MSTR"
  name: string; // "Strategy Inc."
  yf_symbol: string; // "MSTR"
  brand_color: string; // "#f97316"
  series: DailyPoint[];
  latest: DailyPoint;
  last_updated: string;
};

export type BtcPriceSeries = {
  dates: string[];
  prices: number[];
};

export type SnapshotRow = {
  ticker: string;
  name: string;
  brand_color: string;
  price: number;
  mnav: number;
  premium_pct: number;
  btc_holdings: number;
  corr_30d: number | null;
};

export type Snapshot = {
  generated_at: string;
  btc_price: number;
  total_btc_tracked: number;
  rows: SnapshotRow[];
};

export type AiSummaries = Record<string, string>; // ticker -> markdown

// ---------- Loaders (server-side; call only from RSC) ----------

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function readJson<T>(relPath: string): Promise<T> {
  const full = path.join(DATA_DIR, relPath);
  const raw = await fs.readFile(full, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadSnapshot(): Promise<Snapshot> {
  return readJson<Snapshot>("snapshot.json");
}

export async function loadCompany(ticker: string): Promise<CompanySeries> {
  return readJson<CompanySeries>(`companies/${ticker.toUpperCase()}.json`);
}

export async function loadBtcPrice(): Promise<BtcPriceSeries> {
  return readJson<BtcPriceSeries>("btc_price.json");
}

export async function loadAiSummaries(): Promise<AiSummaries> {
  return readJson<AiSummaries>("ai_summaries.json");
}

// Convenience: list known tickers (keep in sync with Phase B pipeline output).
export const KNOWN_TICKERS = ["MSTR", "MTPLF", "MARA", "SMLR", "RIOT"] as const;
export type KnownTicker = (typeof KNOWN_TICKERS)[number];
