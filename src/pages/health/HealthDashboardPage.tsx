import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { StatCard } from '../../components/ui/StatCard';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getHealthDashboardStats, runHealthReminderSweep } from '../../api/services/healthService';
import { toUserFacingError } from '../../utils/userFacingMessage';

const quickLinks = [
  { to: '/dashboard/health/medical', label: 'Medical Surveillance' },
  { to: '/dashboard/health/hygiene', label: 'Occupational Hygiene Monitoring' },
  { to: '/dashboard/health/wellness', label: 'Wellness Programme' }
];

function logDiagnostic(event: string, detail: Record<string, unknown> = {}) {
  try {
    const entry = {
      page: '/dashboard/health',
      event,
      ts: new Date().toISOString(),
      ...detail,
    };
    // eslint-disable-next-line no-console
    console.info('[HealthDashboard]', entry);
    // Forward to any global telemetry sink if available
    if (typeof (window as any).__paaqTelemetry?.track === 'function') {
      (window as any).__paaqTelemetry.track(entry);
    }
  } catch {
    // Never let diagnostics break the page
  }
}

export function HealthDashboardPage() {
  const { activeCompanyId } = useTenant();
  const mountedAt = useRef<number>(Date.now());
  const dataReceivedAt = useRef<number | null>(null);

  const { data, loading, error } = useAsync(async () => {
    if (!activeCompanyId) {
      logDiagnostic('no_active_company', { activeCompanyId });
      return null;
    }
    const fetchStart = Date.now();
    logDiagnostic('fetch_start', { activeCompanyId });

    try {
      await runHealthReminderSweep(activeCompanyId).catch((sweepErr) => {
        logDiagnostic('reminder_sweep_failed', {
          error: sweepErr?.message ?? String(sweepErr),
        });
      });
    } catch (sweepErr: any) {
      logDiagnostic('reminder_sweep_threw', { error: sweepErr?.message ?? String(sweepErr) });
    }

    let stats;
    try {
      stats = await getHealthDashboardStats(activeCompanyId);
      const fetchDuration = Date.now() - fetchStart;
      logDiagnostic('fetch_success', { fetchDuration, hasData: stats != null });
    } catch (fetchErr: any) {
      const fetchDuration = Date.now() - fetchStart;
      logDiagnostic('fetch_error', {
        fetchDuration,
        error: fetchErr?.message ?? String(fetchErr),
        status: fetchErr?.status ?? fetchErr?.response?.status ?? null,
      });
      throw fetchErr;
    }

    return stats;
  }, [activeCompanyId]);

  // Track when data finally renders
  useEffect(() => {
    if (data && dataReceivedAt.current === null) {
      dataReceivedAt.current = Date.now();
      logDiagnostic('data_rendered', {
        timeToRender: dataReceivedAt.current - mountedAt.current,
      });
    }
  }, [data]);

  // Track error state surfacing
  useEffect(() => {
    if (error) {
      logDiagnostic('error_displayed', {
        error: (error as any)?.message ?? String(error),
        timeToError: Date.now() - mountedAt.current,
      });
    }
  }, [error]);

  // Track prolonged loading (potential latency / hang)
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      logDiagnostic('loading_slow', {
        elapsedMs: Date.now() - mountedAt.current,
        stillLoading: true,
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Track unmount before data arrives (drop-off signal)
  useEffect(() => {
    return () => {
      if (dataReceivedAt.current === null) {
        logDiagnostic('unmounted_before_data', {
          elapsedMs: Date.now() - mountedAt.current,
          hadError: !!error,
          wasLoading: loading,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout title="Health Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((item) => (
            <Link key={item.to} to={item.to} className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm hover:bg-surface-50">
              {item.label}
            </Link>
          ))}
        </div>

        {error && <div className="rounded-lg border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{toUserFacingError(error, 'Unable to load health dashboard.')}</div>}
        {loading && <p className="text-sm text-charcoal-500">Loading health dashboard...</p>}
        {!loading && !error && !data && (
          <div className="text-center py-12 text-charcoal-400">No health dashboard data available.</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <StatCard title="Fit" value={data.fitCount} icon="Shield" iconColor="#2ECC71" />
              <StatCard title="Restricted" value={data.restrictedCount} icon="AlertTriangle" iconColor="#F39C12" />
              <StatCard title="Unfit" value={data.unfitCount} icon="XCircle" iconColor="#E74C3C" />
              <StatCard title="Expired" value={data.expiredCount} icon="Clock" iconColor="#E67E22" />
              <StatCard title="Medicals due (30d)" value={data.medicalsExpiringSoon} icon="Calendar" iconColor="#1ABC9C" />
              <StatCard title="Total medical cost" value={data.totalMedicalCost?.toFixed?.(2) ?? 0} icon="Activity" iconColor="#8E44AD" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Average medical cost per employee</p>
                <p className="text-2xl font-bold text-teal mt-1">
                  {data.averageMedicalCostPerEmployee ? data.averageMedicalCostPerEmployee.toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Open hygiene non-compliances</p>
                <p className="text-2xl font-bold text-critical mt-1">{data.openHygieneNonCompliances}</p>
              </div>
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Open health action plans</p>
                <p className="text-2xl font-bold text-warning mt-1">{data.openHealthActionPlans}</p>
              </div>
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Vaccinations due soon</p>
                <p className="text-2xl font-bold text-teal mt-1">{data.vaccinationsDueSoon}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
