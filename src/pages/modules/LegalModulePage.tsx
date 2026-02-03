import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ScaleIcon, BookOpenIcon, ShieldCheckIcon, ArrowRightIcon, PaperclipIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { ComplianceScore } from '../../components/ui/ComplianceScore';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listLegalRequirements } from '../../api/services/legalRequirementsService';
import { listEvidenceForEntityType } from '../../api/services/evidenceService';
import type { EvidenceAttachment, LegalRequirement } from '../../api/models/entities';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function LegalModulePage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();

  const { data: reqs } = useAsync<LegalRequirement[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listLegalRequirements(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: evidence } = useAsync<EvidenceAttachment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listEvidenceForEntityType(activeCompanyId, 'legal_requirement', 2000);
    },
    [activeCompanyId]
  );

  const compliance = useMemo(() => {
    const list = reqs ?? [];
    if (list.length === 0) return 0;
    const compliant = list.filter((r) => r.status === 'compliant').length;
    return Math.round((compliant / list.length) * 100);
  }, [reqs]);

  const evidenceCount = evidence?.length ?? 0;
  const nonCompliant = (reqs ?? []).filter((r) => r.status === 'non-compliant').length;
  const inProgress = (reqs ?? []).filter((r) => r.status === 'in-progress').length;

  return (
    <Layout title="Legal Management">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-purple-700 to-purple-800 rounded-2xl p-6 text-white"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <ScaleIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Legal</h1>
                <p className="text-purple-100">Compliance obligations, evidence, and audit readiness</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore score={compliance} size="md" showLabel={false} />
              <div className="text-right">
                <p className="text-sm text-purple-100">Module Compliance</p>
                <p className="text-3xl font-bold">{compliance}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Requirements</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{(reqs ?? []).length}</p>
            <p className="text-xs text-charcoal-400 mt-1">{nonCompliant} non-compliant</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">In progress</p>
            <p className="text-2xl font-bold text-warning mt-1">{inProgress}</p>
            <p className="text-xs text-charcoal-400 mt-1">Pending close-out</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Evidence files</p>
            <p className="text-2xl font-bold text-teal mt-1">{evidenceCount}</p>
            <p className="text-xs text-charcoal-400 mt-1">Linked to register entries</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <BookOpenIcon className="w-5 h-5 text-teal" />
              Legal register
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Central register linking laws to procedures, risks, training, and evidence.
            </p>
            <button
              onClick={() => navigate('/legal-register')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open register <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-success" />
              Evidence & audit trail
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Evidence files can be uploaded and opened from each legal requirement. Actions are logged in activity reports.
            </p>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open reports <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <PaperclipIcon className="w-5 h-5 text-purple-700" />
              Quick links
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Manage requirements, upload evidence, and track compliance status across your company.
            </p>
            <button
              type="button"
              onClick={() => navigate('/audits')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open audits/inspections <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

