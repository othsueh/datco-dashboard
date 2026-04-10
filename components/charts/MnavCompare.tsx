"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MnavCompareSeries = {
  ticker: string;
  color: string;
  points: { date: string; mnav: number }[];
};

type MergedRow = { date: string; [ticker: string]: string | number | null };

type Props = {
  series: MnavCompareSeries[];
  height?: number;
};

function mergeSeries(series: MnavCompareSeries[]): MergedRow[] {
  const allDates = new Set<string>();
  for (const s of series) for (const p of s.points) allDates.add(p.date);
  const sorted = Array.from(allDates).sort();
  return sorted.map((date) => {
    const row: MergedRow = { date };
    for (const s of series) {
      const pt = s.points.find((p) => p.date === date);
      row[s.ticker] = pt ? pt.mnav : null;
    }
    return row;
  });
}

export function MnavCompare({ series, height = 420 }: Props) {
  const data = mergeSeries(series);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          stroke="#71717a"
          tick={{ fontSize: 11 }}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={24}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fontSize: 11 }}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => v.toFixed(2) + "x"}
        />
        <Tooltip
          contentStyle={{
            background: "#0a0a0a",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [
            value === null || value === undefined
              ? "—"
              : Number(value).toFixed(3) + "x",
            String(name),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine
          y={1}
          stroke="#a1a1aa"
          strokeDasharray="4 4"
          label={{ value: "NAV", fill: "#a1a1aa", fontSize: 11 }}
        />
        {series.map((s) => (
          <Line
            key={s.ticker}
            type="monotone"
            dataKey={s.ticker}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
