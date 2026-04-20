import React, { Suspense } from 'react';

/**
 * ChartWrapper: Lazy-loads recharts to defer heavy charting library.
 * Only imports recharts when this component is rendered.
 */
const LazyCharts = React.lazy(() =>
  import('./LazyChartsContent').then((m) => ({ default: m.LazyChartsContent }))
);

export interface ChartWrapperProps {
  children: React.ReactNode;
}

export function ChartWrapper({ children }: ChartWrapperProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500">Loading chart...</div>}>
      <LazyCharts>{children}</LazyCharts>
    </Suspense>
  );
}
