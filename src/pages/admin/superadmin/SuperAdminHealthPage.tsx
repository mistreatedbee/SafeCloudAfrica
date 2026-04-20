import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ActivityIcon, CheckCircle2Icon, DatabaseIcon, ExternalLinkIcon, XCircleIcon } from 'lucide-react';
import { useAsync } from '../../../api/hooks/useAsync';
import {
  checkInsforgeReachable,
  countOperationalFailuresLast24h,
  listPlatformOperationalEvents
} from '../../../api/services/platformOperationalEventsService';
import type { PlatformOperationalEventRow } from '../../../api/models/entities';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function lastByType(rows: PlatformOperationalEventRow[], eventType: string): PlatformOperationalEventRow | null {
  return rows.find((r) => r.event_type === eventType) ?? null;
}

function readViteEnv(key: string): string | undefined {
  const v = (import.meta as { env?: Record<string, string | undefined> }).env?.[key];
  return v != null && String(v).trim() ? String(v).trim() : undefined;
}

type BackupDisplaySource = 'event' | 'env' | 'none';

function resolveBackupDisplay(
  lastVerified: PlatformOperationalEventRow | null,
  envIso: string | undefined
): { source: BackupDisplaySource; label: string; detail: string } {
  if (lastVerified) {
    return {
      source: 'event',
      label: formatDate(lastVerified.created_at),
      detail: lastVerified.message || 'Recorded verification (platform_operational_events).'
    };
  }
  if (envIso) {
    const d = new Date(envIso);
    if (!Number.isNaN(d.getTime())) {
      return {
        source: 'env',
        label: d.toLocaleString(),
        detail: 'Declared at deploy time (VITE_PLATFORM_LAST_BACKUP_DECLARED_AT). Not a live InsForge API read.'
      };
    }
    return {
      source: 'env',
      label: envIso,
      detail: 'VITE_PLATFORM_LAST_BACKUP_DECLARED_AT is set but not a valid ISO 8601 date.'
    };
  }
  return {
    source: 'none',
    label: 'Not declared',
    detail:
      'Set VITE_PLATFORM_LAST_BACKUP_DECLARED_AT (redeploy) or insert a backup.verified row - see docs/BACKUP-AND-RESTORE.md.'
  };
}

export function SuperAdminHealthPage() {
  const eventsQuery = useAsync(() => listPlatformOperationalEvents(500), []);
  const failuresQuery = useAsync(() => countOperationalFailuresLast24h(), []);
  const pingQuery = useAsync(() => checkInsforgeReachable(), []);

  const rows = eventsQuery.data ?? [];
  const lastEmailOk = useMemo(() => lastByType(rows, 'email.sent'), [rows]);
  const lastEmailFail = useMemo(() => lastByType(rows, 'email.failed'), [rows]);
  const lastCron = useMemo(() => lastByType(rows, 'cron.heartbeat'), [rows]);
  const lastBackupVerified = useMemo(() => lastByType(rows, 'backup.verified'), [rows]);
  const envBackupDeclared = readViteEnv('VITE_PLATFORM_LAST_BACKUP_DECLARED_AT');
  const backupRunbookUrl = readViteEnv('VITE_BACKUP_RUNBOOK_URL');
  const backupDisplay = useMemo(
    () => resolveBackupDisplay(lastBackupVerified, envBackupDeclared),
    [lastBackupVerified, envBackupDeclared]
  );

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

      {loading && <p className="text-sm text-charcoal-500">Loading...</p>}

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

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-3 md:col-span-2">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <DatabaseIcon className="w-4 h-4 text-teal flex-shrink-0" /> Backups &amp; recovery
            </h3>
            <p className="text-xs text-charcoal-500">
              Database and file storage are primarily InsForge&apos;s responsibility. The date below is a{' '}
              <span className="font-medium text-charcoal-600">declared or recorded</span> verification, not a live backup
              API (until provider integration exists). There is no in-app restore.
            </p>
            <div>
              <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide">Last recorded verification</p>
              <p className="text-sm text-charcoal-600 mt-0.5">{backupDisplay.label}</p>
              <p className="text-xs text-charcoal-500 mt-1 break-words">{backupDisplay.detail}</p>
              {backupDisplay.source !== 'none' && (
                <p className="text-xs text-charcoal-400 mt-1">
                  Source: {backupDisplay.source === 'event' ? 'platform_operational_events (backup.verified)' : 'environment variable'}
                </p>
              )}
            </div>
            <div>
              {backupRunbookUrl ? (
                <a
                  href={backupRunbookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-teal hover:underline"
                >
                  Backup &amp; restore runbook
                  <ExternalLinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                </a>
              ) : (
                <p className="text-sm text-charcoal-500">
                  Runbook: <code className="text-xs bg-surface-100 px-1 rounded">docs/BACKUP-AND-RESTORE.md</code> in the
                  repository. Set <code className="text-xs bg-surface-100 px-1 rounded">VITE_BACKUP_RUNBOOK_URL</code> for a
                  clickable link (e.g. GitHub blob URL).
                </p>
              )}
            </div>
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
