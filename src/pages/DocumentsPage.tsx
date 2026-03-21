import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileTextIcon,
  FolderIcon,
  UploadIcon,
  SearchIcon,
  FilterIcon,
  MoreVerticalIcon,
  DownloadIcon,
  EyeIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listDocuments } from '../api/services/documentsService';
import type { Document } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { DocumentUploadModal } from '../components/documents/DocumentUploadModal';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../api/services/documentsStorageService';
import { listLegalRequirementsForLinkedRecord } from '../api/services/legalRequirementsService';
import type { LegalRequirement } from '../api/models/entities';
import { ListEmptyState } from '../components/ui/ListEmptyState';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDateZA(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};
export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canUpload = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [linkedRequirements, setLinkedRequirements] = useState<
    Array<Pick<LegalRequirement, 'id' | 'requirement_standard' | 'compliance_status'>>
  >([]);

  const { data, loading, error } = useAsync<Document[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const documents = data ?? [];
  React.useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId) return;
    const doc = documents.find((d) => d.id === viewId);
    if (!doc?.storage_bucket || !doc.storage_key) return;
    void (async () => {
      const blob = await downloadDocumentFile({ bucket: doc.storage_bucket!, key: doc.storage_key! });
      openBlobInNewTab(blob);
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    })();
  }, [documents, searchParams, setSearchParams]);
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryCounts = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.category] = (acc[doc.category] ?? 0) + 1;
    return acc;
  }, {});
  const categories = Object.entries(categoryCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return (
    <Layout title="Document Management">
      {activeCompanyId && user?.id && (
        <DocumentUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id}
          onUploaded={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Header Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />

            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm font-medium text-charcoal hover:bg-surface-50 transition-colors">
              <FilterIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Filter</span>
            </button>
          </div>
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => setUploadOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <UploadIcon className="w-4 h-4" />
            Upload Document
          </button>
        </motion.div>

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load documents</p>
            <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
          </motion.div>
        )}

        {/* Categories */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            Categories
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((category) =>
            <button
              key={category.name}
              onClick={() =>
              setSelectedCategory(
                selectedCategory === category.name ? null : category.name
              )
              }
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${selectedCategory === category.name ? 'bg-teal-50 border-teal text-teal' : 'bg-white border-surface-300 hover:border-teal/50'}`}>

                <div
                className={`p-2 rounded-lg ${selectedCategory === category.name ? 'bg-teal/10' : 'bg-surface-100'}`}>

                  <FolderIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{category.name}</p>
                  <p className="text-xs text-charcoal-400">
                    {category.count} documents
                  </p>
                </div>
              </button>
            )}
          </div>
        </motion.div>

        {/* Documents Table */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">
                {selectedCategory ?
                `${selectedCategory} Documents` :
                'All Documents'}
              </h3>
              <span className="text-sm text-charcoal-400">
                {filteredDocs.length} documents
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Document
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Version
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Modified
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Author
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {loading && (
                    <tr>
                      <td colSpan={7} className="px-5 py-4 text-sm text-charcoal-500">
                        Loading documents…
                      </td>
                    </tr>
                  )}
                  {!loading && filteredDocs.length === 0 && (
                    <ListEmptyState
                      tableColSpan={7}
                      icon={FileTextIcon}
                      title={documents.length === 0 ? 'No documents uploaded' : 'No documents match filters'}
                      description="Upload controlled documents with version and status so teams always use the right file."
                      primaryAction={
                        canUpload
                          ? { kind: 'button', label: 'Upload document', onClick: () => setUploadOpen(true) }
                          : { kind: 'link', to: '/templates', label: 'Template library' }
                      }
                      secondaryAction={
                        documents.length > 0 && (searchQuery.trim() || selectedCategory)
                          ? {
                              kind: 'button',
                              label: 'Clear search & category',
                              onClick: () => {
                                setSearchQuery('');
                                setSelectedCategory(null);
                              }
                            }
                          : undefined
                      }
                    />
                  )}
                  {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-surface-50 transition-colors">

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-teal-50 rounded-lg">
                            <FileTextIcon className="w-5 h-5 text-teal" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-charcoal">
                              {doc.title}
                            </p>
                            <p className="text-xs text-charcoal-400">
                              DOC-{shortId(doc.id)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">
                        {doc.category}
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">
                        {doc.version}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge
                        status={
                        doc.status === 'approved' ?
                        'completed' :
                        doc.status === 'in_review' ?
                        'pending' :
                        'draft'
                        }
                        size="sm" />

                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">
                        {formatDateZA(doc.updated_at)}
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">
                        {doc.owner_user_id ? `User ${shortId(doc.owner_user_id)}` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={!doc.storage_bucket || !doc.storage_key}
                            onClick={async () => {
                              if (!doc.storage_bucket || !doc.storage_key) return;
                              const blob = await downloadDocumentFile({ bucket: doc.storage_bucket, key: doc.storage_key });
                              openBlobInNewTab(blob);
                            }}
                            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!doc.storage_bucket || !doc.storage_key}
                            onClick={async () => {
                              if (!doc.storage_bucket || !doc.storage_key) return;
                              const blob = await downloadDocumentFile({ bucket: doc.storage_bucket, key: doc.storage_key });
                              const filename = doc.storage_key.split('/').pop() ?? `${doc.title}.bin`;
                              downloadBlob(blob, filename);
                            }}
                            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <DownloadIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
                            onClick={async () => {
                              if (!activeCompanyId) return;
                              try {
                                const rows = await listLegalRequirementsForLinkedRecord({
                                  companyId: activeCompanyId,
                                  moduleType: 'document',
                                  recordId: doc.id
                                });
                                setLinkedRequirements(rows);
                              } catch {
                                setLinkedRequirements([]);
                              }
                            }}
                          >
                            <MoreVerticalIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {linkedRequirements.length > 0 && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-4 space-y-2">
            <h3 className="font-semibold text-charcoal text-sm">Related Legal Requirements</h3>
            <ul className="space-y-1">
              {linkedRequirements.map((lr) => (
                <li key={lr.id} className="text-xs text-charcoal-700">
                  <a href={`/dashboard/legal/register/${lr.id}`} className="text-teal hover:underline">
                    {lr.requirement_standard}
                  </a>
                  <span className="ml-2 inline-flex px-1.5 py-0.5 rounded bg-surface-100 text-[10px] text-charcoal-600">
                    {lr.compliance_status}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.div>
    </Layout>);

}
