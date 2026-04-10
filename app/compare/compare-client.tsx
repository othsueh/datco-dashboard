"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MnavCompare,
  type MnavCompareSeries,
} from "@/components/charts/MnavCompare";

type Range = "3m" | "6m" | "all";

type Props = {
  series: {
    ticker: string;
    name: string;
    color: string;
    points: { date: string; mnav: number }[];
  }[];
};

const RANGE_DAYS: Record<Range, number | null> = {
  "3m": 90,
  "6m": 180,
  all: null,
};

export function CompareClient({ series }: Props) {
  const [range, setRange] = useState<Range>("all");

  const filtered: MnavCompareSeries[] = useMemo(() => {
    const days = RANGE_DAYS[range];
    return series.map((s) => ({
      ticker: s.ticker,
      color: s.color,
      points: days === null ? s.points : s.points.slice(-days),
    }));
  }, [series, range]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.ticker} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-foreground">{s.ticker}</span>
              <span>— {s.name}</span>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {(["3m", "6m", "all"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
      {filtered.some((s) => s.points.length > 0) ? (
        <MnavCompare series={filtered} />
      ) : (
        <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
          No data available for the selected range.
        </div>
      )}
    </div>
  );
}
