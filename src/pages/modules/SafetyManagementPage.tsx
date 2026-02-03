import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileTextIcon,
  FolderIcon,
  UsersIcon,
  CalendarIcon,
  UploadIcon,
  SearchIcon,
  PlusIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertCircleIcon
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { DocumentUploadModal } from '../../components/documents/DocumentUploadModal';
import { StatusBadge } from '../../components/ui/StatusBadge';

type DocumentCategory = 'procedures' | 'plans' | 'policies' | 'manuals' | 'communication' | 'suppliers' | 'agreements' | 'company_docs' | 'method_statements' | 'specifications' | 'roles';

const documentCategories: { value: DocumentCategory; label: string; icon: typeof FileTextIcon }[] = [
  { value: 'procedures', label: 'Procedures', icon: FileTextIcon },
  { value: 'plans', label: 'Plans', icon: FolderIcon },
  { value: 'policies', label: 'Policies', icon: FileTextIcon },
  { value: 'manuals', label: 'Manuals', icon: FileTextIcon },
  { value: 'communication', label: 'Communication & Participation', icon: UsersIcon },
  { value: 'suppliers', label: 'Suppliers', icon: UsersIcon },
  { value: 'agreements', label: 'Agreements & Non-Conformities', icon: FileTextIcon },
  { value: 'company_docs', label: 'Company Documents', icon: FolderIcon },
  { value: 'method_statements', label: 'Method Statements', icon: FileTextIcon },
  { value: 'specifications', label: 'Specifications', icon: FileTextIcon },
  { value: 'roles', label: 'Roles & Responsibilities', icon: UsersIcon }
];

export function SafetyManagementPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('procedures');

  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  // Mock data - replace with actual API calls
  const documents = [
    {
      id: '1',
      title: 'Safety Procedure - Working at Height',
      category: 'procedures' as DocumentCategory,
      version: '2.1',
      status: 'approved' as const,
      uploadedBy: 'John Doe',
      uploadedAt: new Date().toISOString(),
      reviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '2',
      title: 'Emergency Response Plan',
      category: 'plans' as DocumentCategory,
      version: '1.0',
      status: 'in_review' as const,
      uploadedBy: 'Jane Smith',
      uploadedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      reviewDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '3',
      title: 'Safety Policy Statement',
      category: 'policies' as DocumentCategory,
      version: '3.0',
      status: 'approved' as const,
      uploadedBy: 'Admin User',
      uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      reviewDue: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleUpload = (category: DocumentCategory) => {
    setUploadCategory(category);
    setUploadModalOpen(true);
  };

  return (
    <Layout title="Safety Management">
      {activeCompanyId && user?.id && (
        <DocumentUploadModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id}
          defaultModule="safety"
          defaultCategory={uploadCategory}
          onUploaded={() => setUploadModalOpen(false)}
        />
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Safety Management</h1>
            <p className="text-sm text-charcoal-500 mt-1">Document-based safety management system</p>
          </div>
          {canManage && (
            <button
              onClick={() => handleUpload('procedures')}
              className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Upload Document
            </button>
          )}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory | 'all')}
            className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          >
            <option value="all">All Categories</option>
            {documentCategories.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {documentCategories.map(category => {
            const Icon = category.icon;
            const count = documents.filter(d => d.category === category.value).length;
            return (
              <button
                key={category.value}
                onClick={() => {
                  setSelectedCategory(category.value);
                  if (canManage) handleUpload(category.value);
                }}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedCategory === category.value
                    ? 'border-teal bg-teal-50'
                    : 'border-surface-200 bg-white hover:border-surface-300'
                }`}
              >
                <Icon className={`w-6 h-6 mb-2 ${selectedCategory === category.value ? 'text-teal' : 'text-charcoal-400'}`} />
                <p className="text-xs font-medium text-charcoal">{category.label}</p>
                <p className="text-xs text-charcoal-500 mt-1">{count} docs</p>
              </button>
            );
          })}
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-charcoal">Documents</h3>
          </div>
          <div className="divide-y divide-surface-200">
            {filteredDocuments.length === 0 ? (
              <div className="p-8 text-center text-charcoal-500">
                <FileTextIcon className="w-12 h-12 mx-auto mb-3 text-charcoal-300" />
                <p>No documents found</p>
              </div>
            ) : (
              filteredDocuments.map(doc => {
                const categoryLabel = documentCategories.find(c => c.value === doc.category)?.label || doc.category;
                const isOverdue = new Date(doc.reviewDue) < new Date();
                return (
                  <div key={doc.id} className="p-4 hover:bg-surface-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <FileTextIcon className="w-5 h-5 text-charcoal-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-charcoal truncate">{doc.title}</h4>
                            <div className="flex items-center gap-3 mt-1 text-xs text-charcoal-500">
                              <span>{categoryLabel}</span>
                              <span>•</span>
                              <span>Version {doc.version}</span>
                              <span>•</span>
                              <span>By {doc.uploadedBy}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <StatusBadge status={doc.status} size="sm" />
                          <span className="flex items-center gap-1 text-charcoal-500">
                            <CalendarIcon className="w-3 h-3" />
                            Review due: {new Date(doc.reviewDue).toLocaleDateString('en-ZA')}
                            {isOverdue && (
                              <span className="ml-2 text-critical flex items-center gap-1">
                                <AlertCircleIcon className="w-3 h-3" />
                                Overdue
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="text-sm text-teal hover:text-teal-600">View</button>
                        {canManage && (
                          <button className="text-sm text-charcoal-500 hover:text-charcoal">Edit</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Communication & Participation Section */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <UsersIcon className="w-5 h-5" />
              Communication & Participation
            </h3>
            {canManage && (
              <button
                onClick={() => navigate('/safety/meetings/new')}
                className="flex items-center gap-2 px-3 py-1.5 bg-teal text-white rounded-lg text-xs font-medium hover:bg-teal-600 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                Schedule Meeting
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-surface-50 rounded-lg">
              <p className="text-sm text-charcoal-500">Upcoming Meetings</p>
              <p className="text-2xl font-bold text-charcoal mt-1">3</p>
            </div>
            <div className="p-4 bg-surface-50 rounded-lg">
              <p className="text-sm text-charcoal-500">This Month</p>
              <p className="text-2xl font-bold text-charcoal mt-1">12</p>
            </div>
            <div className="p-4 bg-surface-50 rounded-lg">
              <p className="text-sm text-charcoal-500">Attendance Rate</p>
              <p className="text-2xl font-bold text-charcoal mt-1">87%</p>
            </div>
          </div>
          <p className="text-xs text-charcoal-500 mt-4">
            Features: Meeting scheduling, Attendance registers, Digital signatures, Meeting minutes, Next-meeting setup
          </p>
        </div>
      </motion.div>
    </Layout>
  );
}

