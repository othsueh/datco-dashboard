import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompareClient } from "./compare-client";
import { KNOWN_TICKERS, loadCompany, type CompanySeries } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "Side-by-side mNAV comparison across MSTR, MTPLF, MARA, SMLR, and RIOT.",
};

export default async function ComparePage() {
  const companies: CompanySeries[] = await Promise.all(
    KNOWN_TICKERS.map((t) => loadCompany(t)),
  );

  // Project to only the fields the client component needs so serialization
  // across the RSC boundary stays lean.
  const series = companies.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    color: c.brand_color,
    points: c.series.map((p) => ({ date: p.date, mnav: p.mnav })),
  }));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Cross-company comparison
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          mNAV overlay
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Compare how the market values each DAT company relative to its BTC
          holdings. A value of 1.0x means the stock trades in line with NAV;
          values above 1.0x indicate the market is paying a premium for
          equity-wrapped BTC exposure.
        </p>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            mNAV over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompareClient series={series} />
        </CardContent>
      </Card>
    </div>
  );
}
