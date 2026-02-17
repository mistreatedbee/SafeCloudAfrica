import React, { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Incident } from '../../api/models/entities';
import type { IncidentCategory, IncidentType, RiskCategory } from '../../api/models/core';

export type IncidentTrendChartsProps = {
  incidents: Incident[];
  period: '1month' | '2months' | '12months';
};

export function IncidentTrendCharts({ incidents, period }: IncidentTrendChartsProps) {
  // Count by category
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach(incident => {
      counts[incident.category] = (counts[incident.category] || 0) + 1;
    });
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }, [incidents]);

  // Count by type
  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach(incident => {
      const type = incident.type_of_incident || incident.incident_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [incidents]);

  // Count by risk category
  const riskData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach(incident => {
      const risk = incident.risk_category || 'Unknown';
      counts[risk] = (counts[risk] || 0) + 1;
    });
    return Object.entries(counts).map(([risk, count]) => ({ risk, count }));
  }, [incidents]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    incidents.forEach(incident => {
      const date = new Date(incident.occurred_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    });
    return Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [incidents]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Count by Category */}
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <h3 className="text-sm font-semibold text-charcoal mb-4">Incidents by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#14b8a6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Count by Type */}
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <h3 className="text-sm font-semibold text-charcoal mb-4">Incidents by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={typeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Count by Risk */}
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <h3 className="text-sm font-semibold text-charcoal mb-4">Incidents by Risk Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={riskData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="risk" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Trend */}
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <h3 className="text-sm font-semibold text-charcoal mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
