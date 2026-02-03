import React from 'react';
import { motion } from 'framer-motion';
import { BellIcon, CalendarIcon, FileTextIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listDocuments } from '../api/services/documentsService';
import type { Document } from '../api/models/entities';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function DocumentReviewsPage() {
  const { activeCompanyId } = useTenant();
  const { data, loading, error } = useAsync<Document[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId]
  );

  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);

  const alerts = (data ?? [])
    .filter((d) => !!d.review_due_at)
    .map((d) => {
      const due = d.review_due_at ? new Date(d.review_due_at) : null;
      const status =
        due && due.getTime() < now.getTime()
          ? 'Overdue'
          : due && due.getTime() <= soon.getTime()
            ? 'Due Soon'
            : 'Scheduled';
      return { id: d.id, document: d.title, due: d.review_due_at!, status };
    })
    .filter((a) => a.status !== 'Scheduled')
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  return (
    <Layout title="Automated Document Review & Reminders">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-teal" />
            Review reminders
          </h2>
          <p className="text-sm text-charcoal-500 mt-2">
            Live reminders are generated from document `review_due_at` dates. (Email + escalation rules can be layered on top.)
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading reminders…</p>
            </div>
          )}
          {error && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load reminders</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}
          {!loading && !error && alerts.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No document reviews due soon.</p>
            </div>
          )}
          {alerts.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-surface-100 rounded-lg">
                  <FileTextIcon className="w-5 h-5 text-charcoal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{r.document}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">
                        REV-{String(r.id).slice(0, 8)} • <CalendarIcon className="inline w-4 h-4" /> Review due:{' '}
                        {new Date(r.due).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      {r.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}

