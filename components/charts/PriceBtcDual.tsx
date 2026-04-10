"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; close: number; btc_price: number };

type Props = {
  data: Point[];
  stockColor: string;
  ticker: string;
  height?: number;
};

const BTC_COLOR = "#f7931a";

export function PriceBtcDual({
  data,
  stockColor,
  ticker,
  height = 300,
}: Props) {
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
          yAxisId="left"
          orientation="left"
          stroke={stockColor}
          tick={{ fontSize: 11 }}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke={BTC_COLOR}
          tick={{ fontSize: 11 }}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "#0a0a0a",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [
            `$${Number(value).toLocaleString()}`,
            String(name),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="close"
          name={ticker}
          stroke={stockColor}
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="btc_price"
          name="BTC"
          stroke={BTC_COLOR}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
