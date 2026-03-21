import { TrendChart } from '../components/ui/TrendChart';

type Props = {
  incidentTrends: Array<Record<string, any>>;
  comparison: Array<Record<string, any>>;
};

export default function ReportsTrendCharts({ incidentTrends, comparison }: Props) {
  return (
    <div className="contents">
      <TrendChart title="Incident Trends" type="line" height={280} data={incidentTrends} />
      <TrendChart title="Monthly Comparison" type="bar" height={280} data={comparison} />
    </div>
  );
}
