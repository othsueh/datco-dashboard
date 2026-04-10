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

type Point = { date: string; corr_30d: number | null };

type Props = {
  data: Point[];
  color: string;
  height?: number;
};

export function CorrelationLine({ data, color, height = 240 }: Props) {
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
          domain={[-1, 1]}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip
          contentStyle={{
            background: "#0a0a0a",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => {
            if (value === null || value === undefined) return ["—", "corr 30d"];
            return [Number(value).toFixed(3), "corr 30d"];
          }}
        />
        <ReferenceLine y={0} stroke="#52525b" strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="corr_30d"
          name="30d correlation"
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
