import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MnavSparkline } from "@/components/charts/MnavSparkline";
import {
  loadCompany,
  loadSnapshot,
  type CompanySeries,
  type DailyPoint,
} from "@/lib/data";

function formatUsd(v: number, maxFrac = 2) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxFrac,
  });
}

function formatBtc(v: number) {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " BTC";
}

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Snapshot of mNAV, premium-to-NAV, and BTC correlation across the largest public Digital Asset Treasury companies.",
};

export default async function Page() {
  const snapshot = await loadSnapshot();
  // Load each company's series so we can render sparklines.
  const companies: CompanySeries[] = await Promise.all(
    snapshot.rows.map((r) => loadCompany(r.ticker)),
  );
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));

  // Sort snapshot by mNAV desc
  const rows = [...snapshot.rows].sort((a, b) => b.mnav - a.mnav);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Digital Asset Treasury Monitor
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          How the market prices Bitcoin-on-balance-sheet
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          mNAV — the ratio of market cap to the USD value of BTC held — is the
          canonical yardstick for DAT companies. This dashboard tracks it daily
          for the largest public holders, alongside premium-to-NAV and rolling
          30-day correlation with BTC.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                BTC / USD
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatUsd(snapshot.btc_price)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Latest close</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Aggregate BTC tracked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatBtc(snapshot.total_btc_tracked)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {snapshot.rows.length} companies
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Snapshot generated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-medium">
                {new Date(snapshot.generated_at).toUTCString().slice(0, 16)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">UTC</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Snapshot table */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            Today&apos;s snapshot
          </h2>
          <p className="text-xs text-muted-foreground">
            Sorted by mNAV, highest first
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">mNAV</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">BTC held</TableHead>
                  <TableHead className="text-right">30d corr</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.ticker} className="group">
                    <TableCell>
                      <Link
                        href={`/company/${r.ticker}`}
                        className="flex items-center gap-2 font-medium"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: r.brand_color }}
                        />
                        <span>{r.ticker}</span>
                        <span className="text-muted-foreground text-xs">
                          {r.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(r.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.mnav.toFixed(2)}x
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge
                        variant={r.premium_pct >= 0 ? "default" : "destructive"}
                        className="font-mono"
                      >
                        {r.premium_pct >= 0 ? "+" : ""}
                        {r.premium_pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.btc_holdings.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.corr_30d === null ? "—" : r.corr_30d.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/company/${r.ticker}`}
                        className="text-muted-foreground group-hover:text-foreground transition-colors"
                        aria-label={`Open ${r.ticker} detail`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Sparkline grid */}
      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          mNAV — last 60 days
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {rows.map((r) => {
            const c = byTicker.get(r.ticker);
            if (!c) return null;
            const sparkData = c.series.map((p: DailyPoint) => ({
              date: p.date,
              mnav: p.mnav,
            }));
            return (
              <Link
                key={r.ticker}
                href={`/company/${r.ticker}`}
                className="block"
              >
                <Card className="transition-colors hover:border-foreground/30">
                  <CardHeader className="pb-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: r.brand_color }}
                        />
                        <CardTitle className="text-sm font-medium">
                          {r.ticker}
                        </CardTitle>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {r.mnav.toFixed(2)}x
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {sparkData.length > 0 ? (
                      <MnavSparkline data={sparkData} color={r.brand_color} />
                    ) : (
                      <div className="flex h-[60px] items-center justify-center text-xs text-muted-foreground">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
