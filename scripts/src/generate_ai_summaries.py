"""Generate per-company AI summaries using the Anthropic Messages API.

Reads the per-company JSON files previously produced by the indicator pipeline
in ``public/data/companies/<TICKER>.json`` and writes human-readable markdown
blurbs to ``public/data/ai_summaries.json`` as ``{ticker: markdown_string}``.

Design notes
------------
- Must run AFTER fetch/compute steps so that the series we summarize is fresh.
- Preserves existing keys in ``ai_summaries.json``: if we fail to regenerate a
  particular ticker (API error, transient issue), we keep the prior entry so
  the frontend never shows "No summary available" for a company that already
  had one.
- Fully graceful when ``ANTHROPIC_API_KEY`` is not set: logs a warning and
  writes a clear placeholder so the frontend still renders.
- Tone guardrails live in the system prompt: sober, analytical, ~120 words,
  no advice / predictions / price targets.
- Encodes the known data caveats for SMLR (post-merger Strive) and RIOT
  (mining-heavy, not a pure DAT) directly into the user prompt so Claude
  doesn't naively interpret inflated mNAVs.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any, Dict, List, Optional

from .config import (
    PUBLIC_COMPANIES_DIR,
    PUBLIC_DATA_DIR,
    load_companies,
)

AI_SUMMARIES_JSON = PUBLIC_DATA_DIR / "ai_summaries.json"

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 400

SYSTEM_PROMPT = (
    "You are a sober, analytical financial writer covering Digital Asset "
    "Treasury (DAT) companies — public equities that hold Bitcoin on their "
    "balance sheet. You write short, factual narrative blurbs that explain "
    "what recent indicators have been doing in plain English, for readers "
    "who already understand mNAV (market cap divided by BTC NAV), premium "
    "to NAV, and rolling correlation.\n\n"
    "Strict rules:\n"
    "- Output ~120 words or fewer. Aim for 2-4 short paragraphs or a tight "
    "single paragraph.\n"
    "- Use plain English. Minimal jargon.\n"
    "- Use markdown: bolding the company name and key numbers is fine.\n"
    "- Describe WHAT happened and cite the numbers you are given. Do NOT "
    "speculate about WHY beyond what the provided context states.\n"
    "- NEVER give investment advice, buy/sell/hold recommendations, "
    "price targets, or forward-looking predictions.\n"
    "- NEVER invent data or figures that were not provided.\n"
    "- If the context includes caveats (e.g. a merger, a mining overhang), "
    "surface them clearly so the reader does not misread the mNAV number.\n"
)

# Per-ticker context the model cannot infer from the numbers alone.
TICKER_CAVEATS: Dict[str, str] = {
    "SMLR": (
        "Important context: SMLR here represents the post-merger entity. "
        "Semler Scientific was acquired by Strive, Inc. in late 2025 and now "
        "trades as ASST on Nasdaq. The market cap used in the mNAV calculation "
        "reflects the COMBINED Strive entity, but the BTC holdings shown are "
        "only the ~5k BTC inherited from Semler's treasury. As a result the "
        "mNAV will look mechanically inflated for reasons that have nothing "
        "to do with treasury premium. Call this out explicitly."
    ),
    "RIOT": (
        "Important context: RIOT is primarily a Bitcoin MINER, not a pure "
        "treasury company. Its market cap prices a sizeable mining operation "
        "(hash rate, rigs, power contracts) on top of the BTC on its balance "
        "sheet, so its mNAV sits structurally well above 1.0x for reasons "
        "unrelated to treasury premium. Make clear that the mNAV figure is "
        "mechanically correct but should not be compared apples-to-apples "
        "with pure DAT names like MSTR or MTPLF."
    ),
    "MARA": (
        "Context: MARA is also a Bitcoin miner, so part of its equity value "
        "reflects operating mining cash flows, not just the treasury. If the "
        "latest 30-day correlation with BTC has diverged meaningfully from "
        "its longer-run average, that is a real phenomenon — mining-name "
        "overhead (hash price, power costs, equipment cycles) can decouple "
        "miner equities from spot BTC over short windows."
    ),
}


def _load_company_series(ticker: str) -> Optional[dict]:
    path = PUBLIC_COMPANIES_DIR / f"{ticker}.json"
    if not path.exists():
        print(f"[ai] {ticker}: missing {path.name}, skipping")
        return None
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _pct_change(curr: float, prev: float) -> Optional[float]:
    if prev in (0, None) or curr is None:
        return None
    return ((curr - prev) / prev) * 100.0


def _extract_features(company: dict) -> Dict[str, Any]:
    """Pull a compact set of features Claude will summarize."""
    series: List[dict] = company["series"]
    latest = series[-1]

    def point(offset: int) -> Optional[dict]:
        idx = len(series) - 1 - offset
        if idx < 0:
            return None
        return series[idx]

    d30 = point(30)
    d90 = point(90)

    mnav_change_30d_pct = _pct_change(latest["mnav"], d30["mnav"]) if d30 else None
    stock_return_30d_pct = _pct_change(latest["close"], d30["close"]) if d30 else None
    btc_return_30d_pct = _pct_change(latest["btc_price"], d30["btc_price"]) if d30 else None
    premium_change_30d_pp = (
        latest["premium_pct"] - d30["premium_pct"] if d30 else None
    )

    btc_holdings_change_90d = None
    if d90 is not None:
        btc_holdings_change_90d = latest["btc_holdings"] - d90["btc_holdings"]

    # Mean of non-null 30d correlations across the whole series for a baseline
    # that Claude can contrast against the latest value.
    corr_values = [p["corr_30d"] for p in series if p["corr_30d"] is not None]
    corr_mean = (
        round(sum(corr_values) / len(corr_values), 4) if corr_values else None
    )

    return {
        "ticker": company["ticker"],
        "name": company["name"],
        "latest_date": latest["date"],
        "latest_mnav": latest["mnav"],
        "latest_premium_pct": latest["premium_pct"],
        "latest_corr_30d": latest["corr_30d"],
        "latest_btc_holdings": latest["btc_holdings"],
        "latest_close_usd": latest["close"],
        "latest_btc_price_usd": latest["btc_price"],
        "mnav_change_30d_pct": (
            round(mnav_change_30d_pct, 2)
            if mnav_change_30d_pct is not None
            else None
        ),
        "stock_return_30d_pct": (
            round(stock_return_30d_pct, 2)
            if stock_return_30d_pct is not None
            else None
        ),
        "btc_return_30d_pct": (
            round(btc_return_30d_pct, 2)
            if btc_return_30d_pct is not None
            else None
        ),
        "premium_change_30d_pp": (
            round(premium_change_30d_pp, 2)
            if premium_change_30d_pp is not None
            else None
        ),
        "btc_holdings_change_90d": btc_holdings_change_90d,
        "corr_30d_long_run_mean": corr_mean,
    }


def _build_user_prompt(features: Dict[str, Any]) -> str:
    ticker = features["ticker"]
    caveat = TICKER_CAVEATS.get(ticker, "")

    # Render features as a compact, unambiguous fact sheet. We avoid dumping
    # raw JSON here because the labels force the model to ground its prose.
    lines = [
        f"Company: {features['name']} ({ticker})",
        f"As of: {features['latest_date']}",
        "",
        "Latest indicators:",
        f"- mNAV: {features['latest_mnav']}x",
        f"- Premium to NAV: {features['latest_premium_pct']}%",
        f"- 30-day rolling correlation with BTC: {features['latest_corr_30d']}",
        f"- BTC holdings on balance sheet: {features['latest_btc_holdings']:,}",
        f"- Stock close: ${features['latest_close_usd']:,}",
        f"- BTC price: ${features['latest_btc_price_usd']:,}",
        "",
        "30-day changes:",
        f"- mNAV change: {features['mnav_change_30d_pct']}%",
        f"- Stock return: {features['stock_return_30d_pct']}%",
        f"- BTC return: {features['btc_return_30d_pct']}%",
        (
            f"- Premium change (percentage points): "
            f"{features['premium_change_30d_pp']}"
        ),
        "",
        (
            f"Long-run average of 30-day correlation with BTC: "
            f"{features['corr_30d_long_run_mean']}"
        ),
        (
            f"BTC holdings change over last ~90 trading days: "
            f"{features['btc_holdings_change_90d']}"
        ),
    ]
    if caveat:
        lines += ["", "CAVEAT TO INCORPORATE:", caveat]

    lines += [
        "",
        (
            "Write a single short markdown blurb (~120 words, no headings) "
            "that (a) describes how mNAV moved over the last 30 days, "
            "(b) notes whether the stock tracked BTC or decoupled by "
            "comparing the latest 30-day correlation against its long-run "
            "average, (c) mentions any material BTC holdings change in the "
            "last ~90 days, and (d) surfaces any caveat above. No advice, "
            "no predictions, no price targets."
        ),
    ]
    return "\n".join(lines)


def _call_anthropic(client: Any, prompt: str) -> str:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    # content is a list of content blocks; we expect one text block.
    parts: List[str] = []
    for block in msg.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts).strip()


def _load_existing_summaries() -> Dict[str, str]:
    if not AI_SUMMARIES_JSON.exists():
        return {}
    try:
        with AI_SUMMARIES_JSON.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            # Ensure string values
            return {str(k): str(v) for k, v in data.items()}
    except Exception as err:  # noqa: BLE001
        print(f"[ai] warning: could not parse existing {AI_SUMMARIES_JSON.name}: {err}")
    return {}


def _write_summaries(summaries: Dict[str, str]) -> None:
    AI_SUMMARIES_JSON.parent.mkdir(parents=True, exist_ok=True)
    with AI_SUMMARIES_JSON.open("w", encoding="utf-8") as fh:
        json.dump(summaries, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(
        f"[ai] wrote {AI_SUMMARIES_JSON.relative_to(PUBLIC_DATA_DIR.parent.parent)} "
        f"({len(summaries)} entries)"
    )


def main() -> int:
    companies = load_companies()
    tickers = [c.ticker for c in companies]
    print(f"[ai] generating summaries for: {tickers}")

    existing = _load_existing_summaries()
    summaries: Dict[str, str] = dict(existing)  # preserve prior keys by default

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(
            "[ai] WARNING: ANTHROPIC_API_KEY is not set. "
            "Writing placeholder summaries; set the env var and re-run "
            "`uv run python -m src.generate_ai_summaries` to backfill."
        )
        placeholder = (
            "*AI summary unavailable — set ANTHROPIC_API_KEY to enable.*"
        )
        for ticker in tickers:
            summaries[ticker] = placeholder
        _write_summaries(summaries)
        return 0

    # Import here so missing dependency doesn't break the placeholder path.
    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError as err:
        print(f"[ai] ERROR: anthropic SDK not installed: {err}")
        return 1

    client = Anthropic()  # reads ANTHROPIC_API_KEY from env

    any_success = False
    for company_meta in companies:
        ticker = company_meta.ticker
        company = _load_company_series(ticker)
        if company is None:
            continue

        features = _extract_features(company)
        prompt = _build_user_prompt(features)

        try:
            text = _call_anthropic(client, prompt)
            if not text:
                raise RuntimeError("empty response from Anthropic")
            summaries[ticker] = text
            any_success = True
            preview = text.replace("\n", " ")[:80]
            print(f"[ai] {ticker}: ok ({len(text)} chars) — {preview}...")
        except Exception as err:  # noqa: BLE001
            print(f"[ai] {ticker}: FAILED — {err}")
            # Keep the prior entry if it exists; don't overwrite good data.
            if ticker not in summaries:
                summaries[ticker] = (
                    "*AI summary generation failed — will retry on next run.*"
                )

    _write_summaries(summaries)
    return 0 if any_success else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # noqa: BLE001
        print(f"[ai] fatal error: {err}")
        traceback.print_exc()
        sys.exit(1)
