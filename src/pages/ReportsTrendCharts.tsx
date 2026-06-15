import { TrendChart } from '../components/ui/TrendChart';

type Props = {
  incidentTrends: Array<Record<string, any>>;
  comparison: Array<Record<string, any>>;
};

function EmptyChartPlaceholder({ title, height }: { title: string; height: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
      <h3 className="text-base font-semibold text-charcoal mb-4">{title}</h3>
      <div className="flex items-center justify-center text-charcoal-400 text-sm" style={{ height }}>
        No data for this period
      </div>
    </div>
  );
}

export default function ReportsTrendCharts({ incidentTrends, comparison }: Props) {
  return (
    <div className="contents">
      {incidentTrends.length === 0 ? (
        <EmptyChartPlaceholder title="Incident Trends" height={280} />
      ) : (
        <TrendChart title="Incident Trends" type="line" height={280} data={incidentTrends} />
      )}
      {comparison.length === 0 ? (
        <EmptyChartPlaceholder title="Monthly Comparison" height={280} />
      ) : (
        <TrendChart title="Monthly Comparison" type="bar" height={280} data={comparison} />
      )}
    </div>
  );
}
