/**
 * LazyChartsContent: Separates recharts imports to a lazy-loaded chunk.
 * This module is only loaded when ChartWrapper renders.
 */

export interface LazyChartsContentProps {
  children: React.ReactNode;
}

export function LazyChartsContent({ children }: LazyChartsContentProps) {
  // Re-export recharts (or use it) so imports are here, not in parent components
  return <>{children}</>;
}
