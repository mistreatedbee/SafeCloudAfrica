import { LoadingSpinner } from './LoadingSpinner';

export function RouteSuspenseFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center gap-3">
        <LoadingSpinner size={18} />
        <p className="text-sm text-charcoal-500">Loading…</p>
      </div>
    </div>
  );
}

export function ChartSuspenseFallback() {
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center justify-center gap-3 lg:col-span-2 min-h-[200px]">
      <LoadingSpinner size={18} />
      <p className="text-sm text-charcoal-500">Loading charts…</p>
    </div>
  );
}
