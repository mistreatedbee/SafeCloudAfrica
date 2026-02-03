import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SearchIcon, PlusIcon, AlertOctagonIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { RiskHeatMap } from '../components/ui/RiskHeatMap';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import { listRisks } from '../api/services/risksService';
import type { Risk } from '../api/models/entities';
import { RiskCreateModal } from '../components/risks/RiskCreateModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function RisksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const { activeCompanyId, activeRole } = useTenant();
  const canCreate = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const { user } = useUser();
  const isNew = location.search.includes('new=1');
  const [createOpen, setCreateOpen] = useState(isNew && canCreate);

  useEffect(() => setCreateOpen(isNew && canCreate), [canCreate, isNew]);

  const { data, loading, error } = useAsync<Risk[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listRisks({ companyId: activeCompanyId, limit: 500 });
    },
    [activeCompanyId]
  );

  const allRisks = data ?? [];
  const filtered = allRisks.filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || String(r.id).includes(searchQuery));

  const heatMapData = useMemo(() => {
    const counts = new Map<string, { likelihood: number; consequence: number; count: number; level: string }>();
    const levelFor = (rating: number) => {
      if (rating >= 20) return 'critical';
      if (rating >= 12) return 'high';
      if (rating >= 6) return 'medium';
      if (rating >= 3) return 'low';
      return 'minimal';
    };
    for (const r of allRisks) {
      const key = `${r.likelihood}-${r.consequence}`;
      const existing = counts.get(key) ?? {
        likelihood: r.likelihood,
        consequence: r.consequence,
        count: 0,
        level: levelFor(r.risk_rating)
      };
      existing.count += 1;
      existing.level = levelFor(Math.max(r.risk_rating, existing.likelihood * existing.consequence));
      counts.set(key, existing);
    }
    return Array.from(counts.values());
  }, [allRisks]);

  return (
    <Layout title="Risk, Hazard & Permit Management">
      {activeCompanyId && user?.id && (
        <RiskCreateModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            if (isNew) navigate('/risks', { replace: true });
          }}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          defaultModule="safety"
          onCreated={() => navigate('/risks', { replace: true })}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search risks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => navigate('/risks?new=1')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            New Risk Assessment
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RiskHeatMap data={heatMapData} />
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-2 flex items-center gap-2">
              <AlertOctagonIcon className="w-5 h-5 text-warning" />
              Risk register
            </h3>
            <p className="text-sm text-charcoal-500">
              All risk entries are stored per company and update in real time.
            </p>
            {error && <p className="text-sm text-critical mt-2">{error.message}</p>}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading risks…</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No risks found.</p>
            </div>
          )}
          {filtered.map((risk) => (
            <div
              key={risk.id}
              className="bg-white rounded-xl border border-surface-300 p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-surface-100 rounded-lg">
                  <AlertOctagonIcon className="w-5 h-5 text-charcoal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{risk.title}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">
                        RSK-{String(risk.id).slice(0, 8)} • Module: {risk.module} • Rating: {risk.risk_rating}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      {risk.status}
                    </span>
                  </div>
                  {(risk.hazard || risk.controls) && (
                    <p className="text-sm text-charcoal-500 mt-2">
                      {risk.hazard ? `Hazard: ${risk.hazard}` : ''}{risk.hazard && risk.controls ? ' • ' : ''}
                      {risk.controls ? `Controls: ${risk.controls}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}

