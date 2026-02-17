import { X, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import type { QualityNcr, UUID } from '../../api/models/entities';
import { exportNCRPDF, downloadFile } from '../../api/services/exportService';

interface NCRDetailModalProps {
  ncr: QualityNcr;
  onClose: () => void;
  onCloseNCR: (ncrId: UUID) => Promise<void>;
  onManagerApprove?: (ncrId: UUID) => Promise<void>;
  onAuditorVerify?: (ncrId: UUID) => Promise<void>;
  canManageWorkflow?: boolean;
  companyName?: string;
  generatedBy?: string;
}

export default function NCRDetailModal({
  ncr,
  onClose,
  onCloseNCR,
  onManagerApprove,
  onAuditorVerify,
  canManageWorkflow,
  companyName,
  generatedBy
}: NCRDetailModalProps) {
  const handleCloseClick = async () => {
    await onCloseNCR(ncr.id);
  };

  const handleExportPdf = async () => {
    const blob = await exportNCRPDF(ncr, {
      companyName: companyName ?? '',
      generatedBy: generatedBy ?? '',
    });
    const baseName = (ncr as any).nc_number ?? ncr.id;
    downloadFile(blob, `ncr-${String(baseName)}.pdf`);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-50';
      case 'high': return 'text-orange-700 bg-orange-50';
      case 'medium': return 'text-yellow-700 bg-yellow-50';
      default: return 'text-blue-700 bg-blue-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed': return 'text-green-700 bg-green-50';
      case 'open': return 'text-red-700 bg-red-50';
      case 'in-progress': return 'text-blue-700 bg-blue-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{ncr.nc_number}</h2>
            <p className="text-sm text-gray-600 mt-1">{ncr.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-800 hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status & Severity */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg ${getStatusColor(ncr.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {ncr.status === 'closed' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                <span className="font-medium capitalize">{ncr.status}</span>
              </div>
              <p className="text-sm">Current Status</p>
            </div>
            <div className={`p-4 rounded-lg ${getSeverityColor(ncr.severity)}`}>
              <div className="font-medium capitalize mb-1">{ncr.severity}</div>
              <p className="text-sm">Severity Level</p>
            </div>
          </div>

          {/* Description */}
          {ncr.description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{ncr.description}</p>
            </div>
          )}

          {/* Location & Process */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-3">Operational Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ncr.location && (
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-medium text-gray-900">{ncr.location}</p>
                </div>
              )}
              {ncr.process_involved && (
                <div>
                  <p className="text-sm text-gray-600">Process</p>
                  <p className="font-medium text-gray-900">{ncr.process_involved}</p>
                </div>
              )}
              {ncr.activity_involved && (
                <div>
                  <p className="text-sm text-gray-600">Activity</p>
                  <p className="font-medium text-gray-900">{ncr.activity_involved}</p>
                </div>
              )}
              {ncr.responsible_role && (
                <div>
                  <p className="text-sm text-gray-600">Responsible Role</p>
                  <p className="font-medium text-gray-900">{ncr.responsible_role}</p>
                </div>
              )}
            </div>
          </div>

          {/* Compliance Details */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-3">Compliance Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ncr.linked_requirement && (
                <div>
                  <p className="text-sm text-gray-600">Linked Requirement</p>
                  <p className="font-medium text-gray-900">{ncr.linked_requirement}</p>
                </div>
              )}
              {ncr.risk_classification && (
                <div>
                  <p className="text-sm text-gray-600">Risk Classification</p>
                  <p className="font-medium text-gray-900 capitalize">{ncr.risk_classification}</p>
                </div>
              )}
            </div>
          </div>

          {/* Root Cause & Actions */}
          {(ncr.root_cause || ncr.corrective_action) && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Corrective Actions</h3>
              {ncr.root_cause && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-1">Root Cause</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{ncr.root_cause}</p>
                </div>
              )}
              {ncr.corrective_action && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Corrective Action</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{ncr.corrective_action}</p>
                </div>
              )}
              {ncr.corrective_action_due_date && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <span className="font-semibold">Due Date:</span>{' '}
                    {new Date(ncr.corrective_action_due_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Evidence */}
          {ncr.evidence_document_url && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Evidence</h3>
              <a
                href={ncr.evidence_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Evidence Document
              </a>
            </div>
          )}

          {/* Approval Workflow */}
          {(ncr.raised_by_user_id ||
            ncr.approved_by_user_id ||
            ncr.signed_by_user_id ||
            ncr.manager_signoff_user_id ||
            ncr.auditor_verify_user_id) && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Approval Workflow</h3>
              <div className="space-y-2 text-sm">
                {ncr.raised_by_user_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Raised By:</span>
                    <span className="text-gray-900 font-medium">{ncr.raised_by_user_id}</span>
                  </div>
                )}
                {ncr.approved_by_user_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Approved By:</span>
                    <span className="text-gray-900 font-medium">{ncr.approved_by_user_id}</span>
                  </div>
                )}
                {ncr.signed_by_user_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Signed By:</span>
                    <span className="text-gray-900 font-medium">{ncr.signed_by_user_id}</span>
                  </div>
                )}
                {ncr.manager_signoff_user_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Manager Sign-off:</span>
                    <span className="text-gray-900 font-medium">
                      {ncr.manager_signoff_user_id} {ncr.manager_signoff_at ? `at ${new Date(ncr.manager_signoff_at).toLocaleString()}` : ''}
                    </span>
                  </div>
                )}
                {ncr.auditor_verify_user_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Auditor Verification:</span>
                    <span className="text-gray-900 font-medium">
                      {ncr.auditor_verify_user_id}{' '}
                      {ncr.auditor_verify_at ? `at ${new Date(ncr.auditor_verify_at).toLocaleString()}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t pt-4 text-xs text-gray-600 space-y-1">
            {ncr.occurrence_date && (
              <p>Occurred: {new Date(ncr.occurrence_date).toLocaleString()}</p>
            )}
            {ncr.created_at && (
              <p>Created: {new Date(ncr.created_at).toLocaleString()}</p>
            )}
            {ncr.updated_at && (
              <p>Updated: {new Date(ncr.updated_at).toLocaleString()}</p>
            )}
          </div>

          {/* Actions */}
          <div className="border-t pt-4 space-y-3">
            {canManageWorkflow && ncr.status !== 'closed' && (
              <div className="flex flex-wrap gap-2">
                {onManagerApprove && !ncr.manager_signoff_user_id && (
                  <button
                    type="button"
                    onClick={() => void onManagerApprove(ncr.id)}
                    className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                  >
                    Manager sign-off
                  </button>
                )}
                {onAuditorVerify && !!ncr.manager_signoff_user_id && (
                  <button
                    type="button"
                    onClick={() => void onAuditorVerify(ncr.id)}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    Auditor verification
                  </button>
                )}
                {ncr.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={handleCloseClick}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 inline-block mr-1" />
                    Close NCR
                  </button>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
