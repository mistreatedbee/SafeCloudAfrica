import React from 'react';
import { motion } from 'framer-motion';
import { FileTextIcon } from 'lucide-react';
import { useAsync } from '../../../api/hooks/useAsync';
import { listPlatformAdminAuditLogs } from '../../../api/services/platformAdminAuditService';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function SuperAdminAuditLogsPage() {
  const { data: logs, loading, error } = useAsync(() => listPlatformAdminAuditLogs(200), []);

  const list = logs ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <FileTextIcon className="w-4 h-4 text-teal" /> Audit Logs
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          Log of Super Admin actions: license create, module toggle, user role change, support mode.
        </p>
      </div>

      {error && <p className="text-sm text-critical">{String((error as Error)?.message)}</p>}
      {loading && <p className="text-sm text-charcoal-500">Loading…</p>}

      {!loading && list.length === 0 && (
        <p className="text-sm text-charcoal-500">No audit entries yet.</p>
      )}

      {!loading && list.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Time</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Actor</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Action</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Target org</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Target user</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {list.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm text-charcoal-500">{formatDate(log.created_at)}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{log.actor_user_id}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{log.action}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{log.target_company_id ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{log.target_user_id ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">
                      {log.details ? JSON.stringify(log.details) : '—'}
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
