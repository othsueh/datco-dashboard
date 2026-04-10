"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from "recharts";

type Point = { date: string; mnav: number };

type Props = {
  data: Point[];
  color: string;
  height?: number;
};

export function MnavSparkline({ data, color, height = 60 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <YAxis hide domain={["auto", "auto"]} />
        <ReferenceLine y={1} stroke="#52525b" strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="mnav"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
