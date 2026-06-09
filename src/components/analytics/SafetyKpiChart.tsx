import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { MonthPoint } from '../../api/services/kpiFormulasService';

export type SafetyKpiChartProps = {
  title: string;
  data: MonthPoint[];
  barKey: keyof MonthPoint;
  barLabel: string;
  /** Omit for Free Man Hours chart (bars only, no rate line). */
  lineKey?: keyof MonthPoint;
  lineLabel?: string;
  height?: number;
};

export function SafetyKpiChart({
  title,
  data,
  barKey,
  barLabel,
  lineKey,
  lineLabel,
  height = 260
}: SafetyKpiChartProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
      <p className="text-sm font-medium text-charcoal mb-3">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: lineKey ? 40 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="monthKey"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v: string) => v.slice(5)} // show "MM" only
          />
          {/* Left axis — bar counts / severity days */}
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            width={40}
            allowDecimals={false}
          />
          {lineKey && (
            /* Right axis — rolling rate */
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              width={48}
            />
          )}
          <Tooltip
            formatter={(value: number, name: string) =>
              [typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="left"
            dataKey={barKey as string}
            name={barLabel}
            fill="#14b8a6"
            radius={[2, 2, 0, 0]}
            maxBarSize={32}
          />
          {lineKey && lineLabel && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={lineKey as string}
              name={lineLabel}
              stroke="#1f2937"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
