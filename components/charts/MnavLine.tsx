"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; mnav: number };

type Props = {
  data: Point[];
  color: string;
  height?: number;
};

export function MnavLine({ data, color, height = 260 }: Props) {
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
          formatter={(value) => [Number(value).toFixed(3) + "x", "mNAV"]}
        />
        <ReferenceLine
          y={1}
          stroke="#a1a1aa"
          strokeDasharray="4 4"
          label={{ value: "NAV (1.0x)", fill: "#a1a1aa", fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="mnav"
          name="mNAV"
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
