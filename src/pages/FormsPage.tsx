import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangleIcon, FileTextIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  createFormTemplate,
  deleteFormTemplate,
  listFormSubmissions,
  listFormTemplates,
  type FormTemplate
} from '../api/services/formsService';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function FormsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { activeCompanyId } = useTenant();

  const { data: templates, loading, error, refetch } = useAsync<FormTemplate[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listFormTemplates(activeCompanyId);
    },
    [activeCompanyId]
  );

  const {
    data: submissionCounts,
    loading: submissionCountsLoading
  } = useAsync<Record<string, number>>(
    async () => {
      if (!templates?.length) return {};
      const entries = await Promise.all(
        templates.map(async (template) => {
          const submissions = await listFormSubmissions(template.id);
          return [template.id, submissions.length] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    [templates]
  );

  const filtered = useMemo(
    () =>
      (templates || []).filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.module.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [searchQuery, templates]
  );

  const handleDelete = async (templateId: string) => {
    if (!activeCompanyId) return;
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await deleteFormTemplate(activeCompanyId, templateId);
      refetch();
    } catch {
      alert('Failed to delete template');
    }
  };

  return (
    <Layout title="Forms & Templates">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <FileTextIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Forms & Templates</h1>
              <p className="text-blue-100">Create, manage, and submit forms (Phase 2 feature - manual builder)</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <FileTextIcon className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-charcoal">Form Templates</h2>
              <p className="text-sm text-charcoal-400">Manage reusable forms and templates</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-10 pr-4 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New Template
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">Templates</h3>
            <span className="text-sm text-charcoal-400">{filtered.length} templates</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Module</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Submissions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-charcoal-500">
                      Loading live form templates...
                    </td>
                  </tr>
                ) : error ? (
                  <ListEmptyState
                    tableColSpan={5}
                    icon={AlertTriangleIcon}
                    title="Could not load form templates"
                    description={error.message || 'The latest form templates could not be loaded right now.'}
                    primaryAction={{ kind: 'button', label: 'Refresh', onClick: refetch }}
                  />
                ) : filtered.length === 0 ? (
                  <ListEmptyState
                    tableColSpan={5}
                    icon={FileTextIcon}
                    title="No live form templates yet"
                    description="Templates will appear here as soon as they are created in the current organisation."
                    primaryAction={{ kind: 'button', label: 'Refresh', onClick: refetch }}
                  />
                ) : (
                  filtered.map((template) => (
                    <tr key={template.id} className="hover:bg-surface-50">
                      <td className="px-5 py-4 text-sm font-medium text-charcoal">{template.name}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-600">{template.module}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-600">
                        {template.original_pdf_key ? 'PDF Upload' : 'Manual Builder'}
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-600">
                        {submissionCountsLoading ? '...' : String(submissionCounts?.[template.id] ?? 0)}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDelete(template.id)}
                            className="text-critical hover:text-critical-600 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-50 border border-surface-200 rounded-xl p-6">
          <h3 className="font-semibold text-charcoal mb-2">Phase 2 Forms System</h3>
          <ul className="text-sm text-charcoal-600 space-y-1">
            <li>• PDF upload for existing forms</li>
            <li>• Manual form builder (drag-drop fields)</li>
            <li>• Template management and assignment</li>
            <li>• Submission storage and retrieval</li>
            <li>• OCR for PDFs (deferred to Phase 3)</li>
          </ul>
        </motion.div>

        {/* Create Template Modal */}
        {showCreateModal && (
          <CreateTemplateModal
            companyId={activeCompanyId!}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              setShowCreateModal(false);
              refetch();
            }}
          />
        )}
      </motion.div>
    </Layout>
  );
}

function CreateTemplateModal({
  companyId,
  onClose,
  onCreated
}: {
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [module, setModule] = useState('safety');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await createFormTemplate({
        companyId,
        module,
        name: name.trim(),
        description: description.trim() || undefined,
        schema: [], // Empty for now, will add manual builder later
        pdfFile: pdfFile || undefined
      });
      onCreated();
    } catch (err) {
      alert('Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-charcoal">Create Form Template</h3>
            <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                placeholder="e.g. Safety Inspection Checklist"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Module</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
              >
                <option value="safety">Safety</option>
                <option value="hr">HR</option>
                <option value="legal">Legal</option>
                <option value="quality">Quality</option>
                <option value="health">Health</option>
                <option value="environment">Environment</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                rows={3}
                placeholder="Optional description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">PDF Upload (Optional)</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-charcoal-500 mt-1">
                Upload an existing PDF form, or leave empty to use manual builder
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-surface-300 text-charcoal rounded-lg text-sm font-semibold hover:bg-surface-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 px-4 py-2 bg-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
