import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar } from
'recharts';
type TrendChartProps = {
  type?: 'line' | 'bar';
  title?: string;
  height?: number;
  data?: Array<Record<string, any>>;
};
export function TrendChart({
  type = 'line',
  title = 'Incident Trends',
  height = 250,
  data = []
}: TrendChartProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
      <h3 className="text-base font-semibold text-charcoal mb-4">{title}</h3>

      <ResponsiveContainer width="100%" height={height}>
        {type === 'line' ?
        <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF0" />
            <XAxis
            dataKey="month"
            tick={{
              fill: '#757575',
              fontSize: 12
            }}
            axisLine={{
              stroke: '#E8ECF0'
            }} />

            <YAxis
            tick={{
              fill: '#757575',
              fontSize: 12
            }}
            axisLine={{
              stroke: '#E8ECF0'
            }} />

            <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E8ECF0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(10, 37, 64, 0.1)'
            }} />

            <Legend
            wrapperStyle={{
              paddingTop: '10px'
            }}
            iconType="circle" />

            <Line
            type="monotone"
            dataKey="incidents"
            name="Incidents"
            stroke="#E74C3C"
            strokeWidth={2}
            dot={{
              fill: '#E74C3C',
              strokeWidth: 2,
              r: 4
            }}
            activeDot={{
              r: 6
            }} />

            <Line
            type="monotone"
            dataKey="nearMisses"
            name="Near Misses"
            stroke="#F5A623"
            strokeWidth={2}
            dot={{
              fill: '#F5A623',
              strokeWidth: 2,
              r: 4
            }}
            activeDot={{
              r: 6
            }} />

            <Line
            type="monotone"
            dataKey="lti"
            name="LTI"
            stroke="#0A2540"
            strokeWidth={2}
            dot={{
              fill: '#0A2540',
              strokeWidth: 2,
              r: 4
            }}
            activeDot={{
              r: 6
            }} />

          </LineChart> :

        <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF0" />
            <XAxis
            dataKey="month"
            tick={{
              fill: '#757575',
              fontSize: 12
            }}
            axisLine={{
              stroke: '#E8ECF0'
            }} />

            <YAxis
            tick={{
              fill: '#757575',
              fontSize: 12
            }}
            axisLine={{
              stroke: '#E8ECF0'
            }} />

            <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E8ECF0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(10, 37, 64, 0.1)'
            }} />

            <Legend
            wrapperStyle={{
              paddingTop: '10px'
            }}
            iconType="circle" />

            <Bar
            dataKey="incidents"
            name="Incidents"
            fill="#E74C3C"
            radius={[4, 4, 0, 0]} />

            <Bar
            dataKey="nearMisses"
            name="Near Misses"
            fill="#F5A623"
            radius={[4, 4, 0, 0]} />

          </BarChart>
        }
      </ResponsiveContainer>
    </div>);

}