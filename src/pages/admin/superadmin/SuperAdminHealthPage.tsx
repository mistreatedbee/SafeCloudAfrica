import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ActivityIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useAsync } from '../../../api/hooks/useAsync';
import {
  checkInsforgeReachable,
  countOperationalFailuresLast24h,
  listPlatformOperationalEvents
} from '../../../api/services/platformOperationalEventsService';
import type { PlatformOperationalEventRow } from '../../../api/models/entities';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function lastByType(rows: PlatformOperationalEventRow[], eventType: string): PlatformOperationalEventRow | null {
  return rows.find((r) => r.event_type === eventType) ?? null;
}

export function SuperAdminHealthPage() {
  const eventsQuery = useAsync(() => listPlatformOperationalEvents(500), []);
  const failuresQuery = useAsync(() => countOperationalFailuresLast24h(), []);
  const pingQuery = useAsync(() => checkInsforgeReachable(), []);

  const rows = eventsQuery.data ?? [];
  const lastEmailOk = useMemo(() => lastByType(rows, 'email.sent'), [rows]);
  const lastEmailFail = useMemo(() => lastByType(rows, 'email.failed'), [rows]);
  const lastCron = useMemo(() => lastByType(rows, 'cron.heartbeat'), [rows]);

  const loading = eventsQuery.loading || failuresQuery.loading || pingQuery.loading;
  const loadError = eventsQuery.error || failuresQuery.error || pingQuery.error;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-teal" /> Platform health
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          Recent operational signals from email delivery, optional cron heartbeats, and client error reports. Requires
          migration <code className="text-xs bg-surface-100 px-1 rounded">platform_operational_events</code> and{' '}
          <code className="text-xs bg-surface-100 px-1 rounded">INSFORGE_SERVICE_ROLE_KEY</code> on Vercel for server
          writes.
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-critical">{String((loadError as Error)?.message || loadError)}</p>
      )}

      {loading && <p className="text-sm text-charcoal-500">Loading…</p>}

      {!loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">InsForge / API reachability</h3>
            {pingQuery.data?.ok ? (
              <p className="flex items-center gap-2 text-sm text-teal-700">
                <CheckCircle2Icon className="w-4 h-4 flex-shrink-0" /> Connected (sample query succeeded)
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-critical">
                <XCircleIcon className="w-4 h-4 flex-shrink-0" />
                {pingQuery.data?.error ?? 'Unreachable'}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">Rolling failures (24h)</h3>
            <p className="text-2xl font-semibold text-charcoal">{failuresQuery.data ?? 0}</p>
            <p className="text-xs text-charcoal-500">Rows with status failure in the last 24 hours.</p>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-2">
            <h3 className="text-sm font-semibold text-charcoal">Last successful email</h3>
            <p className="text-sm text-charcoal-600">{formatDate(lastEmailOk?.created_at)}</p>
            <p className="text-xs text-charcoal-500 break-all">{lastEmailOk?.message ?? 'No events recorded yet.'}</p>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-2">
            <h3 className="text-sm font-semibold text-charcoal">Last failed email</h3>
            <p className="text-sm text-charcoal-600">{formatDate(lastEmailFail?.created_at)}</p>
            <p className="text-xs text-charcoal-500 break-all">{lastEmailFail?.message ?? 'No failures recorded.'}</p>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-2 md:col-span-2">
            <h3 className="text-sm font-semibold text-charcoal">Last cron / heartbeat</h3>
            <p className="text-sm text-charcoal-600">{formatDate(lastCron?.created_at)}</p>
            <p className="text-xs text-charcoal-500 break-all">
              {lastCron
                ? `${lastCron.status}: ${lastCron.message}`
                : 'No heartbeat yet. Configure Vercel cron and CRON_SECRET, or ping from InsForge cron (see scripts/insforge-functions/README).'}
            </p>
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-charcoal">Recent events</h3>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Module</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.slice(0, 40).map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-50">
                    <td className="px-4 py-2 text-charcoal-500 whitespace-nowrap">{formatDate(ev.created_at)}</td>
                    <td className="px-4 py-2 text-charcoal">{ev.event_type}</td>
                    <td className="px-4 py-2 text-charcoal-500">{ev.status}</td>
                    <td className="px-4 py-2 text-charcoal-500">{ev.module}</td>
                    <td className="px-4 py-2 text-charcoal-500 max-w-md truncate" title={ev.message}>
                      {ev.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
