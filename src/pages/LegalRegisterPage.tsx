import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ScaleIcon, SearchIcon, PlusIcon, PaperclipIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listLegalRequirements, updateLegalRequirement } from '../api/services/legalRequirementsService';
import type { EvidenceAttachment, LegalRequirement } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { LegalRequirementCreateModal } from '../components/legal/LegalRequirementCreateModal';
import { listEvidenceForEntityType } from '../api/services/evidenceService';
import { EvidenceModal } from '../components/evidence/EvidenceModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function LegalRegisterPage() {
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const { activeCompanyId, activeRole } = useTenant();
  const canCreate = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const canUpdate = canCreate;
  const [refreshKey, setRefreshKey] = useState(0);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);

  const { data, loading, error } = useAsync<LegalRequirement[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listLegalRequirements(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const { data: evidenceAll } = useAsync<EvidenceAttachment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listEvidenceForEntityType(activeCompanyId, 'legal_requirement', 2000);
    },
    [activeCompanyId, refreshKey]
  );

  const evidenceCountByEntity = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of evidenceAll ?? []) {
      const k = String(e.entity_id);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [evidenceAll]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((row) => row.requirement.toLowerCase().includes(q) || String(row.id).includes(q));
  }, [data, searchQuery]);

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Layout title="Legal & ISO Compliance Register">
      {activeCompanyId && user?.id && (
        <>
          <LegalRequirementCreateModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            onCreated={() => {
              setCreateOpen(false);
              setRefreshKey((k) => k + 1);
            }}
          />
          {activeEvidenceId && (
            <EvidenceModal
              open={evidenceOpen}
              onClose={() => setEvidenceOpen(false)}
              companyId={activeCompanyId}
              actorUserId={user.id}
              entityType="legal_requirement"
              entityId={activeEvidenceId as any}
              title="Legal evidence"
            />
          )}
        </>
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-xl">
              <ScaleIcon className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-charcoal">Compliance obligations, evidence, and linkage</h2>
              <p className="text-sm text-charcoal-400">Live register per company with evidence attachments and status tracking</p>
            </div>
          </div>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Add Requirement
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
          <input
            type="search"
            placeholder="Search legal register..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">Register</h3>
            <span className="text-sm text-charcoal-400">{filtered.length} entries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Requirement</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Jurisdiction</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Linked Module</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-critical">
                      {error.message}
                    </td>
                  </tr>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                      No requirements found.
                    </td>
                  </tr>
                )}
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-teal">LEG-{String(row.id).slice(0, 8)}</td>
                    <td className="px-5 py-4 text-sm text-charcoal">{row.requirement}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.reference ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.module}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">
                      <select
                        value={row.status}
                        disabled={!canUpdate}
                        onChange={async (e) => {
                          if (!activeCompanyId || !user?.id) return;
                          const next = e.target.value as LegalRequirement['status'];
                          await updateLegalRequirement({
                            companyId: activeCompanyId,
                            id: row.id,
                            status: next,
                            actorUserId: user.id
                          });
                          setRefreshKey((k) => k + 1);
                        }}
                        className="px-2 py-1 rounded border border-surface-300 bg-white text-sm disabled:opacity-60"
                      >
                        <option value="in-progress">in-progress</option>
                        <option value="compliant">compliant</option>
                        <option value="non-compliant">non-compliant</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveEvidenceId(String(row.id));
                          setEvidenceOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-sm text-teal hover:text-teal-700"
                      >
                        <PaperclipIcon className="w-4 h-4" /> {evidenceCountByEntity.get(String(row.id)) ?? 0}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

