// Per-company caveats shown on the company detail page.
//
// These annotate the mNAV number with context the raw metric can't express
// — for example, post-merger ticker changes or business-mix reasons the
// correlation with BTC may be noisier than a pure treasury company.
//
// Tickers without an entry here render no caveat. MSTR and MTPLF are pure
// DAT companies and intentionally have no caveat.

export type Caveat = {
  label: string; // short badge text, e.g. "Note"
  text: string; // one-sentence explanation
};

export const CAVEATS: Record<string, Caveat> = {
  SMLR: {
    label: "Ticker note",
    text: "Semler Scientific merged with Strive in 2025 and now trades as ASST; the SMLR history here is included for continuity but no longer reflects a live ticker.",
  },
  RIOT: {
    label: "Business mix",
    text: "Riot is a mining-heavy operator rather than a pure digital asset treasury, so its mNAV reflects mining economics as much as BTC holdings and its BTC correlation is typically weaker.",
  },
  MARA: {
    label: "Business mix",
    text: "MARA's equity frequently decouples from BTC on mining-cycle news (hash rate, energy costs, ASIC cycles); expect a lower and noisier BTC correlation than a pure treasury name.",
  },
};

export function getCaveat(ticker: string): Caveat | undefined {
  return CAVEATS[ticker.toUpperCase()];
}
