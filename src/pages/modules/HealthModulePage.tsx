import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HeartIcon, CalendarIcon, AlertTriangleIcon, GraduationCapIcon, UploadIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { ComplianceScore } from '../../components/ui/ComplianceScore';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listModuleTargets } from '../../api/services/moduleTargetsService';
import { countIncidentsByStatusForModule } from '../../api/services/incidentsService';
import { countExpiringTraining, countExpiringTrainingForUser } from '../../api/services/trainingService';
import { countExpiringMedical, listMedicalCertificates } from '../../api/services/healthService';
import type { MedicalCertificate, ModuleTarget } from '../../api/models/entities';
import { MedicalCertificateUploadModal } from '../../components/health/MedicalCertificateUploadModal';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../../api/services/documentsStorageService';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function HealthModulePage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const canUploadForSelf = !!user?.id;
  const canUploadForOthers = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  const { data: targets } = useAsync<ModuleTarget[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listModuleTargets({ companyId: activeCompanyId, module: 'health', limit: 500 });
    },
    [activeCompanyId, refreshKey]
  );
  const compliance = useMemo(() => {
    const list = targets ?? [];
    if (list.length === 0) return 0;
    const achieved = list.filter((t) => t.achieved).length;
    return Math.round((achieved / list.length) * 100);
  }, [targets]);

  const { data: medicalsDue } = useAsync<number>(
    async () => {
      if (!activeCompanyId) return 0;
      return await countExpiringMedical(activeCompanyId, 30);
    },
    [activeCompanyId, refreshKey]
  );

  const { data: expiringTraining } = useAsync<number>(
    async () => {
      if (!activeCompanyId || !user?.id) return 0;
      return activeRole === 'employee'
        ? await countExpiringTrainingForUser(activeCompanyId, user.id, 30)
        : await countExpiringTraining(activeCompanyId, 30);
    },
    [activeCompanyId, activeRole, user?.id, refreshKey]
  );

  const { data: openIncidents } = useAsync<number>(
    async () => {
      if (!activeCompanyId) return 0;
      return await countIncidentsByStatusForModule(activeCompanyId, 'health', 'open');
    },
    [activeCompanyId, refreshKey]
  );

  const { data: certificates } = useAsync<MedicalCertificate[]>(
    async () => {
      if (!activeCompanyId) return [];
      const userId = activeRole === 'employee' ? (user?.id ?? undefined) : undefined;
      return await listMedicalCertificates(activeCompanyId, { userId, limit: 20 });
    },
    [activeCompanyId, activeRole, user?.id, refreshKey]
  );

  const nextReviewDays = useMemo(() => {
    const upcoming = (certificates ?? [])
      .map((c) => (c.expires_at ? new Date(c.expires_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (upcoming.length === 0) return null;
    const diffMs = upcoming[0] - Date.now();
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }, [certificates]);

  return (
    <Layout title="Health Management">
      {activeCompanyId && user?.id && (
        <MedicalCertificateUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id}
          defaultUserId={activeRole === 'employee' ? user.id : undefined}
          onUploaded={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl p-6 text-white"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <HeartIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Health</h1>
                <p className="text-rose-100">Occupational health certificates, expiry tracking, and health incident visibility</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore score={compliance} size="md" showLabel={false} />
              <div className="text-right">
                <p className="text-sm text-rose-100">Module Compliance</p>
                <p className="text-3xl font-bold">{compliance}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Medicals Due</p>
            <p className="text-2xl font-bold text-warning mt-1">{medicalsDue ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Expiring Training</p>
            <p className="text-2xl font-bold text-critical mt-1">{expiringTraining ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Health Incidents</p>
            <p className="text-2xl font-bold text-critical mt-1">{openIncidents ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Next Review</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{nextReviewDays === null ? '—' : `${nextReviewDays}d`}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-teal" />
              Medical surveillance
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Track fitness certificates and expiry dates per employee. Upload evidence files for audit readiness.
            </p>
            <button
              type="button"
              disabled={!(canUploadForSelf || canUploadForOthers)}
              onClick={() => setUploadOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <UploadIcon className="w-4 h-4" />
              Upload certificate
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <GraduationCapIcon className="w-5 h-5 text-teal" />
              Training link
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Health compliance is tied to training competency and expiry reminders.
            </p>
            <button
              type="button"
              onClick={() => (window.location.href = '/training')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              Manage training →
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <AlertTriangleIcon className="w-5 h-5 text-warning" />
              Health incidents
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Health-related incidents are visible from the incident system and update in real time.
            </p>
            <button
              type="button"
              onClick={() => (window.location.href = '/incidents')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              View incidents →
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">Medical certificates</h3>
            <span className="text-sm text-charcoal-400">{(certificates ?? []).length} records</span>
          </div>
          <div className="divide-y divide-surface-100">
            {(certificates ?? []).length === 0 && (
              <div className="px-5 py-4">
                <p className="text-sm text-charcoal-500">No medical certificates yet.</p>
              </div>
            )}
            {(certificates ?? []).map((c) => {
              const canOpen = !!c.certificate_bucket && !!c.certificate_key;
              const filename = c.certificate_key?.split('/').pop() ?? 'certificate';
              return (
                <div key={c.id} className="px-5 py-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{c.certificate_type}</p>
                    <p className="text-sm text-charcoal-500 mt-1">
                      User: {String(c.user_id).slice(0, 8)} • Status: {c.status}
                      {c.expires_at ? ` • Expires: ${new Date(c.expires_at).toLocaleDateString('en-ZA')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canOpen}
                      onClick={async () => {
                        if (!c.certificate_bucket || !c.certificate_key) return;
                        const blob = await downloadDocumentFile({ bucket: c.certificate_bucket, key: c.certificate_key });
                        openBlobInNewTab(blob);
                      }}
                      className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      disabled={!canOpen}
                      onClick={async () => {
                        if (!c.certificate_bucket || !c.certificate_key) return;
                        const blob = await downloadDocumentFile({ bucket: c.certificate_bucket, key: c.certificate_key });
                        downloadBlob(blob, filename);
                      }}
                      className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

