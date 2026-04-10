import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PriceBtcDual } from "@/components/charts/PriceBtcDual";
import { MnavLine } from "@/components/charts/MnavLine";
import { CorrelationLine } from "@/components/charts/CorrelationLine";
import {
  KNOWN_TICKERS,
  loadAiSummaries,
  loadCompany,
  type DailyPoint,
} from "@/lib/data";
import { getCaveat } from "@/lib/caveats";

export function generateStaticParams() {
  return KNOWN_TICKERS.map((ticker) => ({ ticker }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  try {
    const company = await loadCompany(upper);
    return {
      title: company.ticker,
      description: `mNAV, premium-to-NAV, and BTC correlation for ${company.name} (${company.ticker}).`,
    };
  } catch {
    return {
      title: upper,
      description: "DATco Dashboard company detail page.",
    };
  }
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-xs text-muted-foreground"
      style={{ height }}
    >
      No data
    </div>
  );
}

function pctDelta(now: number, then: number) {
  if (!then) return 0;
  return ((now - then) / then) * 100;
}

function formatPct(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function formatUsd(v: number) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  let company;
  try {
    company = await loadCompany(upper);
  } catch {
    notFound();
  }

  const summaries = await loadAiSummaries();
  const summary = summaries[upper];
  const caveat = getCaveat(upper);

  const series = company.series;
  const latest = company.latest;

  const pointAt = (offset: number): DailyPoint | undefined =>
    series[series.length - 1 - offset];

  const d1 = pointAt(1);
  const d7 = pointAt(7);
  const d30 = pointAt(30);

  const delta1 = d1 ? pctDelta(latest.mnav, d1.mnav) : 0;
  const delta7 = d7 ? pctDelta(latest.mnav, d7.mnav) : 0;
  const delta30 = d30 ? pctDelta(latest.mnav, d30.mnav) : 0;

  // Build chart datasets
  const priceBtcData = series.map((p) => ({
    date: p.date,
    close: p.close,
    btc_price: p.btc_price,
  }));
  const mnavData = series.map((p) => ({ date: p.date, mnav: p.mnav }));
  const corrData = series.map((p) => ({
    date: p.date,
    corr_30d: p.corr_30d,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <section>
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: company.brand_color }}
          />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {company.name}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {company.ticker}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last close {formatUsd(latest.close)} &middot; BTC{" "}
              {formatUsd(latest.btc_price)}
            </p>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                mNAV
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                {latest.mnav.toFixed(2)}x
              </p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="flex gap-3 text-xs">
              <DeltaBlock label="1d" value={delta1} />
              <DeltaBlock label="7d" value={delta7} />
              <DeltaBlock label="30d" value={delta30} />
            </div>
          </div>
        </div>
        {caveat ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <Badge
              variant="outline"
              className="mt-0.5 border-amber-500/40 text-amber-300"
            >
              {caveat.label}
            </Badge>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              {caveat.text}
            </p>
          </div>
        ) : null}
      </section>

      {/* Charts */}
      <section className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              Stock price vs BTC (dual axis)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priceBtcData.length > 0 ? (
              <PriceBtcDual
                data={priceBtcData}
                stockColor={company.brand_color}
                ticker={company.ticker}
              />
            ) : (
              <ChartEmpty height={300} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              mNAV history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mnavData.length > 0 ? (
              <MnavLine data={mnavData} color={company.brand_color} />
            ) : (
              <ChartEmpty height={260} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              Rolling 30d correlation with BTC
            </CardTitle>
          </CardHeader>
          <CardContent>
            {corrData.some((p) => p.corr_30d !== null) ? (
              <CorrelationLine data={corrData} color={company.brand_color} />
            ) : (
              <ChartEmpty height={240} />
            )}
          </CardContent>
        </Card>
      </section>

      {/* AI summary */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              AI-generated summary
              <Badge variant="secondary" className="ml-2 font-mono">
                stub
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary ? (
              <div className="max-w-none text-sm leading-6 text-muted-foreground [&_p]:mb-3 [&_strong]:text-foreground [&_em]:italic">
                <ReactMarkdown>{summary}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No summary available for {company.ticker}.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function DeltaBlock({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div>
      <p className="text-muted-foreground uppercase">{label}</p>
      <p
        className={`tabular-nums font-medium ${
          positive ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {formatPct(value)}
      </p>
    </div>
  );
}
