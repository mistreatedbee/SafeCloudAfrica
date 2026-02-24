import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileTextIcon, SearchIcon, DownloadIcon, FolderIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listTemplateLibrary } from '../../api/services/templateLibraryService';
import type { TemplateLibraryItem } from '../../api/models/entities';
import { TemplateUploadModal } from '../../components/features/TemplateUploadModal';
import { downloadBlob, downloadDocumentFile } from '../../api/services/documentsStorageService';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function TemplateLibraryPage() {
  const [q, setQ] = useState('');
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, error } = useAsync<TemplateLibraryItem[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listTemplateLibrary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const filtered = useMemo(() => {
    const list = (data ?? []).map((t) => ({
      ...t,
      shortId: `TPL-${String(t.id).slice(0, 6)}`
    }));
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((t) => t.name.toLowerCase().includes(qq) || t.category.toLowerCase().includes(qq) || t.type.toLowerCase().includes(qq));
  }, [data, q]);

  if (isSellableFeatureAccessError(error) && error.code === 'FEATURE_LOCKED') {
    return <SellableFeatureLockedPage featureKey="templateLibrary" />;
  }

  return (
    <Layout title="Ready‑Made Industry Templates">
      {activeCompanyId && user?.id && (
        <TemplateUploadModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
                <FolderIcon className="w-5 h-5 text-teal" />
                Template library (sellable accelerant)
              </h2>
              <p className="text-sm text-charcoal-500 mt-2">
                Store company template documents and download them instantly for reuse.
              </p>
            </div>
            <button
              type="button"
              disabled={!canManage}
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Add template
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
          <input
            type="search"
            placeholder="Search templates..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
              <p className="text-sm text-charcoal-500">No templates yet.</p>
            </div>
          )}
          {filtered.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <FileTextIcon className="w-5 h-5 text-teal" />
                  </div>
                  <div>
                    <p className="font-medium text-charcoal">{t.name}</p>
                    <p className="text-sm text-charcoal-400 mt-0.5">
                      {(t as any).shortId} • {t.type} • {t.category}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!t.storage_bucket || !t.storage_key}
                  onClick={async () => {
                    if (!t.storage_bucket || !t.storage_key) return;
                    const blob = await downloadDocumentFile({ bucket: t.storage_bucket, key: t.storage_key });
                    const filename = t.storage_key.split('/').pop() ?? `${t.name}.bin`;
                    downloadBlob(blob, filename);
                  }}
                  className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-teal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <DownloadIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}
