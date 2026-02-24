import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, CheckCircle, Clock, Filter } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { listQualityNcrs, createQualityNcr, closeQualityNcr } from '../api/services/qualityNcrsService';
import type { QualityNcr, UUID } from '../api/models/entities';
import { NcrCreateModal } from '../components/ncrs/NcrCreateModal';
import NCRDetailModal from '../components/ncrs/NCRDetailModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function NCRsPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [ncrs, setNcrs] = useState<QualityNcr[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<QualityNcr | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canCreateNcr =
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';
  const canCloseNcr = activeRole === 'admin' || activeRole === 'supervisor';

  const canUploadEvidenceForNcr = (ncr: QualityNcr): boolean => {
    if (!user?.id) return false;
    if (activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor') return true;
    if (activeRole === 'employee') return false;
    if (activeRole === 'consultant' || activeRole === 'auditor') {
      const isAssigned =
        ncr.auditor_user_id === user.id ||
        ncr.auditee_user_id === user.id ||
        ncr.corrective_action_owner_user_id === user.id;
      return isAssigned;
    }
    return false;
  };

  useEffect(() => {
    if (activeCompanyId && user?.id) {
      loadNCRs();
    }
  }, [activeCompanyId, selectedStatus]);

  async function loadNCRs() {
    try {
      setLoading(true);
      setError('');
      const data = await listQualityNcrs({
        companyId: activeCompanyId,
        status: selectedStatus === 'all' ? undefined : selectedStatus
      });
      setNcrs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NCRs');
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseNCR(ncrId: UUID) {
    if (!user?.id || !canCloseNcr) return;
    try {
      const updated = await closeQualityNcr(ncrId, activeCompanyId, user.id, user.id);
      if (updated) {
        setNcrs(ncrs.map(ncr => ncr.id === ncrId ? updated : ncr));
        setSelectedNCR(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close NCR');
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'closed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'open': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'in-progress': return <Clock className="w-4 h-4 text-blue-600" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed': return 'bg-green-50 border-green-200';
      case 'open': return 'bg-red-50 border-red-200';
      case 'in-progress': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const filteredNCRs = selectedStatus === 'all'
    ? ncrs
    : ncrs.filter(n => n.status === selectedStatus);

  return (
    <>
      <Helmet>
        <title>Non-Conformance Reports - SafeCloud Africa</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-navy-900">Non-Conformance Reports</h1>
              <p className="text-gray-600 mt-1">Manage quality non-conformances and corrective actions</p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              disabled={!canCreateNcr}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              New NCR
            </button>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200"
            >
              {error}
            </motion.div>
          )}

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 flex gap-2 flex-wrap"
          >
            <button
              onClick={() => setSelectedStatus('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                selectedStatus === 'all'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              All ({ncrs.length})
            </button>
            {['open', 'in-progress', 'closed'].map(status => {
              const count = ncrs.filter(n => n.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`px-3 py-2 rounded-lg transition-colors capitalize ${
                    selectedStatus === status
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {status} ({count})
                </button>
              );
            })}
          </motion.div>

          {/* NCR List */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4"
          >
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
              </div>
            ) : filteredNCRs.length === 0 ? (
              <motion.div
                variants={itemVariants}
                className="text-center py-12 bg-white rounded-lg border border-gray-200"
              >
                <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No non-conformance reports found</p>
              </motion.div>
            ) : (
              filteredNCRs.map((ncr) => (
                <motion.div
                  key={ncr.id}
                  variants={itemVariants}
                  onClick={() => {
                    setSelectedNCR(ncr);
                    setIsDetailModalOpen(true);
                  }}
                  className={`p-6 rounded-lg border cursor-pointer transition-all hover:shadow-lg ${getStatusColor(ncr.status)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(ncr.status)}
                        <h3 className="text-lg font-semibold text-gray-900">{ncr.nc_number}</h3>
                        <span className={`text-xs px-2 py-1 rounded border ${getSeverityColor(ncr.severity)}`}>
                          {ncr.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium mb-2">{ncr.title}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        {ncr.location && <span>📍 {ncr.location}</span>}
                        {ncr.process_involved && <span>⚙️ {ncr.process_involved}</span>}
                        {ncr.occurrence_date && (
                          <span>📅 {new Date(ncr.occurrence_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-gray-200 text-gray-800 rounded text-sm font-medium capitalize">
                        {ncr.status}
                      </span>
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/improvement/new?sourceType=ncr&sourceId=${ncr.id}`);
                          }}
                          className="text-xs text-teal hover:text-teal-700"
                        >
                          Create Improvement/CAPA
                        </button>
                      </div>
                      {ncr.corrective_action_due_date && (
                        <p className="text-xs text-gray-600 mt-2">
                          Due: {new Date(ncr.corrective_action_due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <NcrCreateModal
            open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user?.id || ''}
            onCreated={() => {
              setIsCreateModalOpen(false);
              loadNCRs();
            }}
          />
        )}
        {isDetailModalOpen && selectedNCR && activeCompanyId && user?.id && (
          <NCRDetailModal
            ncr={selectedNCR}
            companyId={activeCompanyId}
            actorUserId={user.id as UUID}
            canCloseNcr={canCloseNcr}
            canUploadEvidence={canUploadEvidenceForNcr(selectedNCR)}
            onClose={() => setIsDetailModalOpen(false)}
            onCloseNCR={handleCloseNCR}
            onNcrUpdated={(updated) => {
              setNcrs((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
              setSelectedNCR(updated);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
