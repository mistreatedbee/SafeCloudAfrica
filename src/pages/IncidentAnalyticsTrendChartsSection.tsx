import { IncidentTrendCharts } from '../components/incidents/IncidentTrendCharts';
import type { Incident } from '../api/models/entities';

type Props = {
  incidents: Incident[];
  period: '1month' | '2months' | '12months';
};

export default function IncidentAnalyticsTrendChartsSection({ incidents, period }: Props) {
  return <IncidentTrendCharts incidents={incidents} period={period} />;
}
