import { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle, AlertTriangle, FileText, EyeIcon, DownloadIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LegalRequirement, NcrEvidenceReference, QualityNcr, UUID } from '../../api/models/entities';
import type { CompanyRole } from '../../api/models/core';
import { getRiskAssessment } from '../../api/services/riskAssessmentsService';
import { listLegalRequirementsForLinkedRecord } from '../../api/services/legalRequirementsService';
import { formatAuthError } from '../../auth/authMessages';
import {
  auditorVerifyQualityNcr,
  getQualityNcr,
  listNcrEvidence,
  managerSignOffQualityNcr,
  rejectQualityNcrClosure,
  resolveNcrLinkedAuditType,
  sendQualityNcrForReview,
  syncNcrEvidenceFromAttachments,
  updateQualityNcr,
  uploadNcrEvidenceFiles
} from '../../api/services/qualityNcrsService';
import {
  canCloseQualityNcr,
  canAuditorVerifyNcr,
  canManagerSignOffNcr,
  canRejectNcrClosure,
  canSendNcrForReview,
  ncrClosureSignoffMessage,
  ncrRequiresAuditorVerification
} from '../../api/permissions/ncrPermissions';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../../api/services/documentsStorageService';
import { downloadFile } from '../../api/services/exportService';
import { exportNcrDetailPdf } from '../../api/services/ncrReportExportService';
import { useIdentity } from '../../hooks/useIdentity';
import { useTenant } from '../../tenant/TenantContext';
import { getCompanyLogoUrl } from '../../utils/companyLogo';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useToast } from '../ui/ToastProvider';

type EvidenceKind = 'BEFORE' | 'AFTER';

interface NCRDetailModalProps {
  ncr: QualityNcr;
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  canDeleteNcr: boolean;
  canUploadEvidence: boolean;
  onClose: () => void;
  onCloseNCR: (ncrId: UUID) => Promise<void>;
  onDeleteNCR: (ncrId: UUID) => Promise<void>;
  onNcrUpdated: (ncr: QualityNcr) => void;
}

export default function NCRDetailModal({
  ncr,
  companyId,
  actorUserId,
  actorRole,
  canDeleteNcr,
  canUploadEvidence,
  onClose,
  onCloseNCR,
  onDeleteNCR,
  onNcrUpdated
}: NCRDetailModalProps) {
  const { showSuccess, showError } = useToast();
  const { fullName, organisationName } = useIdentity();
  const { activeCompany } = useTenant();
  const logoUrl = useMemo(
    () => getCompanyLogoUrl((activeCompany?.metadata ?? {}) as Record<string, unknown>),
    [activeCompany?.metadata]
  );
  const [exportingPdf, setExportingPdf] = useState(false);
  const [linkedAuditType, setLinkedAuditType] = useState<string | null>(null);
  const requiresAuditorVerification = ncrRequiresAuditorVerification(ncr, linkedAuditType);
  const canManagerSignOff = canManagerSignOffNcr(actorRole);
  const canAuditorVerify = canAuditorVerifyNcr({ ncr, actorUserId, actorRole });
  const canCloseNcr = canCloseQualityNcr({ ncr, actorUserId, actorRole });
  const canSendForReview = canSendNcrForReview({ ncr, actorUserId, actorRole });
  const canRejectClosure = canRejectNcrClosure(actorRole);
  const [error, setError] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<EvidenceKind | null>(null);
  const [filesBefore, setFilesBefore] = useState<File[]>([]);
  const [filesAfter, setFilesAfter] = useState<File[]>([]);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadedBefore, setLoadedBefore] = useState<NcrEvidenceReference[] | null>(null);
  const [loadedAfter, setLoadedAfter] = useState<NcrEvidenceReference[] | null>(null);
  const [linkedRequirementTypeEdit, setLinkedRequirementTypeEdit] = useState<'STANDARD' | 'POLICY' | 'PROCEDURE'>(
    (ncr.linked_requirement_type as any) ?? 'STANDARD'
  );
  const [linkedRequirementEdit, setLinkedRequirementEdit] = useState(ncr.linked_requirement ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState<'manager' | 'auditor' | 'review' | 'reject' | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [linkedRiskReference, setLinkedRiskReference] = useState<string | null>(null);
  const [linkedRiskId, setLinkedRiskId] = useState<UUID | null>(null);
  const [linkedLegalRequirements, setLinkedLegalRequirements] = useState<
    Array<Pick<LegalRequirement, 'id' | 'requirement_standard' | 'compliance_status'>>
  >([]);

  const evidenceBefore = useMemo(
    () => (loadedBefore ?? ((ncr.evidence_before ?? []) as NcrEvidenceReference[])),
    [loadedBefore, ncr.evidence_before]
  );
  const evidenceAfter = useMemo(
    () => (loadedAfter ?? ((ncr.evidence_after ?? []) as NcrEvidenceReference[])),
    [loadedAfter, ncr.evidence_after]
  );

  useEffect(() => {
    let cancelled = false;
    const loadAuditType = async () => {
      try {
        const auditType = await resolveNcrLinkedAuditType(ncr);
        if (!cancelled) setLinkedAuditType(auditType);
      } catch {
        if (!cancelled) setLinkedAuditType(null);
      }
    };
    void loadAuditType();
    return () => {
      cancelled = true;
    };
  }, [ncr]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await syncNcrEvidenceFromAttachments(companyId, ncr.id);
        const latest = await listNcrEvidence(companyId, ncr.id);
        if (!cancelled) {
          setLoadedBefore(latest.evidenceBefore);
          setLoadedAfter(latest.evidenceAfter);
        }
      } catch {
        if (!cancelled) {
          setLoadedBefore((ncr.evidence_before ?? []) as NcrEvidenceReference[]);
          setLoadedAfter((ncr.evidence_after ?? []) as NcrEvidenceReference[]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, ncr.id, ncr.evidence_before, ncr.evidence_after]);

  useEffect(() => {
    let cancelled = false;
    const loadLinkedRisk = async () => {
      try {
        if (!ncr.source_entity_type || !ncr.source_entity_id) return;
        const sourceType = String(ncr.source_entity_type).toLowerCase();
        if (sourceType !== 'risk' && sourceType !== 'risk_assessment') return;
        const ra = await getRiskAssessment({
          companyId,
          assessmentId: ncr.source_entity_id as UUID,
          actorUserId,
          actorRole: null,
          scope: null,
          logView: false
        });
        if (!cancelled && ra) {
          setLinkedRiskReference(ra.reference ?? null);
          setLinkedRiskId(ra.id);
        }
      } catch {
        if (!cancelled) {
          setLinkedRiskReference(null);
          setLinkedRiskId(null);
        }
      }
    };
    void loadLinkedRisk();
    return () => {
      cancelled = true;
    };
  }, [companyId, actorUserId, ncr.source_entity_type, ncr.source_entity_id]);

  useEffect(() => {
    let cancelled = false;
    const loadLinkedLegal = async () => {
      try {
        const rows = await listLegalRequirementsForLinkedRecord({
          companyId,
          moduleType: 'ncr',
          recordId: ncr.id
        });
        if (!cancelled) {
          setLinkedLegalRequirements(rows);
        }
      } catch {
        if (!cancelled) {
          setLinkedLegalRequirements([]);
        }
      }
    };
    void loadLinkedLegal();
    return () => {
      cancelled = true;
    };
  }, [companyId, ncr.id]);

  useEffect(() => {
    setLinkedRequirementTypeEdit((ncr.linked_requirement_type as any) ?? 'STANDARD');
    setLinkedRequirementEdit(ncr.linked_requirement ?? '');
  }, [ncr.linked_requirement_type, ncr.linked_requirement]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-700 bg-red-50';
      case 'high':
        return 'text-orange-700 bg-orange-50';
      case 'medium':
        return 'text-yellow-700 bg-yellow-50';
      default:
        return 'text-blue-700 bg-blue-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed':
        return 'text-green-700 bg-green-50';
      case 'open':
        return 'text-red-700 bg-red-50';
      case 'in-progress':
        return 'text-blue-700 bg-blue-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  async function uploadForKind(kind: EvidenceKind) {
    const queue = kind === 'BEFORE' ? filesBefore : filesAfter;
    if (queue.length < 1) return;

    setError(null);
    setUploadingKind(kind);
    try {
      const synced = await uploadNcrEvidenceFiles({
        companyId,
        ncrId: ncr.id,
        actorUserId,
        files: queue,
        kind
      });
      onNcrUpdated(synced);
      setLoadedBefore((synced.evidence_before ?? []) as NcrEvidenceReference[]);
      setLoadedAfter((synced.evidence_after ?? []) as NcrEvidenceReference[]);
      if (kind === 'BEFORE') setFilesBefore([]);
      if (kind === 'AFTER') setFilesAfter([]);
      showSuccess(
        kind === 'AFTER'
          ? `Closure evidence uploaded for ${ncr.nc_number}. You can now close the NCR after sign-offs are complete.`
          : `Evidence uploaded and saved to ${ncr.nc_number}.`
      );
    } catch (err: any) {
      const message = formatAuthError(err);
      setError(message);
      showError(message);
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleCloseClick() {
    if (!canCloseNcr) {
      setError('Only the assigned person or a senior/manager role can close this NCR.');
      return;
    }

    setError(null);
    setClosing(true);
    try {
      const latestNcr = (await getQualityNcr(ncr.id, companyId)) ?? ncr;
      if (!latestNcr.manager_signoff_user_id) {
        throw new Error('Manager sign-off is required before closing this NCR.');
      }
      const auditType = await resolveNcrLinkedAuditType(latestNcr);
      if (
        ncrRequiresAuditorVerification(latestNcr, auditType) &&
        !latestNcr.auditor_verify_user_id
      ) {
        throw new Error('Auditor verification is required for external audit NCRs before closing.');
      }

      const latestEvidence = await listNcrEvidence(companyId, ncr.id);
      setLoadedAfter(latestEvidence.evidenceAfter);
      if (latestEvidence.evidenceAfter.length < 1) {
        throw new Error('Evidence of Closure is required. Upload files under "Evidence of Closure" (not "Evidence of Non-Conformance"), then click Upload files.');
      }
      await onCloseNCR(ncr.id);
      showSuccess(`${ncr.nc_number} closed successfully.`);
      onClose();
    } catch (err: any) {
      const message = formatAuthError(err);
      setError(message);
      showError(message);
    } finally {
      setClosing(false);
    }
  }

  async function handleDeleteClick() {
    if (!canDeleteNcr) {
      setError('You do not have permission to delete this NCR.');
      return;
    }
    if (!window.confirm(`Delete NCR ${ncr.nc_number}? This cannot be undone.`)) return;

    setError(null);
    setDeleting(true);
    try {
      await onDeleteNCR(ncr.id);
      showSuccess(`${ncr.nc_number} deleted.`);
    } catch (err: any) {
      const message = formatAuthError(err);
      setError(message);
      showError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveDetails() {
    setError(null);
    setSavingDetails(true);
    try {
      const updated = await updateQualityNcr(
        ncr.id,
        companyId,
        {
          linked_requirement_type: linkedRequirementTypeEdit,
          linked_requirement: linkedRequirementEdit.trim()
        } as any,
        actorUserId
      );
      if (updated) {
        onNcrUpdated(updated);
        showSuccess('NCR details saved.');
      }
    } catch (err: any) {
      const message = formatAuthError(err);
      setError(message);
      showError(message);
    } finally {
      setSavingDetails(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] overflow-y-auto p-4 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90dvh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{ncr.nc_number}</h2>
            <p className="text-sm text-gray-600 mt-1 truncate">{ncr.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={exportingPdf}
              onClick={async () => {
                setExportingPdf(true);
                try {
                  const blob = await exportNcrDetailPdf({
                    ncr,
                    companyName: organisationName,
                    generatedBy: fullName,
                    logoUrl
                  });
                  const safeNumber = (ncr.nc_number ?? ncr.id.slice(0, 8)).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
                  downloadFile(blob, `ncr-${safeNumber}.pdf`);
                } catch (err: unknown) {
                  showError(err instanceof Error ? err.message : 'Failed to export PDF.');
                } finally {
                  setExportingPdf(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-300 text-sm hover:bg-surface-50 disabled:opacity-60"
            >
              <DownloadIcon className="w-4 h-4" />
              {exportingPdf ? 'PDF…' : 'PDF'}
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-critical/5 border border-critical/20 rounded-lg">
              <p className="text-sm text-critical font-semibold">NCR action failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg ${getStatusColor(ncr.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {ncr.status === 'closed' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span className="font-medium capitalize">{ncr.status}</span>
              </div>
              <p className="text-sm">Current Status</p>
            </div>
            <div className={`p-4 rounded-lg ${getSeverityColor(ncr.severity)}`}>
              <div className="font-medium capitalize mb-1">{ncr.severity}</div>
              <p className="text-sm">Severity Level</p>
            </div>
          </div>

          {linkedLegalRequirements.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-1">Related Legal Requirements</p>
              <ul className="space-y-1">
                {linkedLegalRequirements.map((lr) => (
                  <li key={lr.id} className="text-xs text-charcoal-700">
                    <button
                      type="button"
                      onClick={() => window.open(`/dashboard/legal/register/${lr.id}`, '_blank')}
                      className="text-teal hover:underline"
                    >
                      {lr.requirement_standard}
                    </button>
                    <span className="ml-2 inline-flex px-1.5 py-0.5 rounded bg-surface-100 text-[10px] text-charcoal-600">
                      {lr.compliance_status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {linkedRiskReference && linkedRiskId && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-1">Linked Risk Assessment</p>
              <button
                type="button"
                onClick={() => window.open(`/risk-assessments/${linkedRiskId}`, '_blank')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
              >
                <span className="font-mono">{linkedRiskReference}</span>
                <span className="text-charcoal-400">Open</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p className="text-sm text-gray-600">Linked to requirement type</p>
              <select
                value={linkedRequirementTypeEdit}
                onChange={(e) => setLinkedRequirementTypeEdit(e.target.value as 'STANDARD' | 'POLICY' | 'PROCEDURE')}
                className="mt-1 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="STANDARD">Standard</option>
                <option value="POLICY">Policy</option>
                <option value="PROCEDURE">Procedure</option>
              </select>
            </div>
            <div>
              <p className="text-sm text-gray-600">Linked Requirement</p>
              <input
                value={linkedRequirementEdit}
                onChange={(e) => setLinkedRequirementEdit(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <p className="text-sm text-gray-600">Before evidence uploaded</p>
              <p className="font-medium text-gray-900">{evidenceBefore.length > 0 ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Closure evidence uploaded</p>
              <p className="font-medium text-gray-900">{evidenceAfter.length > 0 ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Date Closed</p>
              <p className="font-medium text-gray-900">{ncr.date_closed ? new Date(ncr.date_closed).toLocaleString() : 'Not closed yet'}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveDetails()}
              disabled={savingDetails}
              className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-60"
            >
              {savingDetails ? 'Saving...' : 'Save NCR details'}
            </button>
          </div>

          {ncr.description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{ncr.description}</p>
            </div>
          )}

          <EvidenceSection
            title="Evidence of Non-Conformance"
            description="Upload proof showing the non-conformance before corrective action."
            files={filesBefore}
            setFiles={setFilesBefore}
            evidence={evidenceBefore}
            canUpload={canUploadEvidence}
            uploading={uploadingKind === 'BEFORE'}
            onUpload={() => void uploadForKind('BEFORE')}
          />

          <EvidenceSection
            title="Evidence of Closure"
            description="Upload proof showing the issue has been corrected (after corrective action)."
            files={filesAfter}
            setFiles={setFilesAfter}
            evidence={evidenceAfter}
            canUpload={canUploadEvidence}
            uploading={uploadingKind === 'AFTER'}
            onUpload={() => void uploadForKind('AFTER')}
          />

          <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 rounded-b-lg border-t border-gray-200 bg-white px-6 py-4 flex flex-wrap gap-3 z-10">
            {canRejectClosure &&
              ncr.status !== 'closed' &&
              (ncr.manager_signoff_user_id || ncr.auditor_verify_user_id) && (
                <div className="w-full flex flex-col gap-2">
                  <input
                    type="text"
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="Rejection comment (required to reopen)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (!rejectComment.trim()) {
                        setError('A rejection comment is required.');
                        return;
                      }
                      setError(null);
                      setWorkflowSaving('reject');
                      try {
                        const updated = await rejectQualityNcrClosure({
                          companyId,
                          ncrId: ncr.id,
                          actorUserId,
                          comment: rejectComment.trim()
                        });
                        onNcrUpdated(updated);
                        setRejectComment('');
                        showSuccess(`${ncr.nc_number} reopened for further action.`);
                      } catch (err: any) {
                        const message = formatAuthError(err);
                        setError(message);
                        showError(message);
                      } finally {
                        setWorkflowSaving(null);
                      }
                    }}
                    disabled={workflowSaving !== null}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-60"
                  >
                    {workflowSaving === 'reject' ? 'Rejecting...' : 'Reject closure & reopen'}
                  </button>
                </div>
              )}
            {canSendForReview &&
              ncr.status !== 'closed' &&
              !['under-review', 'approved'].includes(ncr.status) && (
                <button
                  onClick={async () => {
                    setError(null);
                    setWorkflowSaving('review');
                    try {
                      const updated = await sendQualityNcrForReview({
                        companyId,
                        ncrId: ncr.id,
                        actorUserId
                      });
                      onNcrUpdated(updated);
                      showSuccess(`${ncr.nc_number} sent for review.`);
                    } catch (err: any) {
                      const message = formatAuthError(err);
                      setError(message);
                      showError(message);
                    } finally {
                      setWorkflowSaving(null);
                    }
                  }}
                  disabled={workflowSaving !== null}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
                >
                  {workflowSaving === 'review' ? 'Sending...' : 'Send for review'}
                </button>
              )}
            {canDeleteNcr && (
              <button
                onClick={() => void handleDeleteClick()}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-critical text-white rounded-lg hover:bg-critical/90 transition-colors font-medium disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete NCR'}
              </button>
            )}
            {ncr.status !== 'closed' && !ncr.manager_signoff_user_id && canManagerSignOff && (
              <button
                onClick={async () => {
                  setError(null);
                  setWorkflowSaving('manager');
                  try {
                    const updated = await managerSignOffQualityNcr({
                      companyId,
                      ncrId: ncr.id,
                      managerUserId: actorUserId
                    });
                    onNcrUpdated(updated);
                    showSuccess(
                      ncrRequiresAuditorVerification(updated, linkedAuditType)
                        ? `${ncr.nc_number} signed off. Awaiting auditor verification (external audit).`
                        : ncrClosureSignoffMessage(updated, linkedAuditType)
                    );
                  } catch (err: any) {
                    const message = formatAuthError(err);
                    setError(message);
                    showError(message);
                  } finally {
                    setWorkflowSaving(null);
                  }
                }}
                disabled={workflowSaving !== null}
                className="flex-1 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-700 transition-colors font-medium disabled:opacity-60"
              >
                {workflowSaving === 'manager' ? 'Signing...' : 'Manager Sign-Off'}
              </button>
            )}
            {ncr.status !== 'closed' &&
              requiresAuditorVerification &&
              ncr.manager_signoff_user_id &&
              !ncr.auditor_verify_user_id &&
              canAuditorVerify && (
              <button
                onClick={async () => {
                  setError(null);
                  setWorkflowSaving('auditor');
                  try {
                    const updated = await auditorVerifyQualityNcr({
                      companyId,
                      ncrId: ncr.id,
                      auditorUserId: actorUserId
                    });
                    onNcrUpdated(updated);
                    const latestEvidence = await listNcrEvidence(companyId, ncr.id);
                    setLoadedAfter(latestEvidence.evidenceAfter);
                    showSuccess(`${ncr.nc_number} verified by auditor. Upload closure evidence if needed, then close the NCR.`);
                  } catch (err: any) {
                    const message = formatAuthError(err);
                    setError(message);
                    showError(message);
                  } finally {
                    setWorkflowSaving(null);
                  }
                }}
                disabled={workflowSaving !== null}
                className="flex-1 px-4 py-2 bg-teal text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-60"
              >
                {workflowSaving === 'auditor' ? 'Verifying...' : 'Auditor Verify'}
              </button>
            )}
            {ncr.status !== 'closed' && (
              <button
                onClick={() => void handleCloseClick()}
                disabled={closing || !canCloseNcr}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-60"
              >
                {closing ? <LoadingSpinner size={16} /> : <CheckCircle className="w-4 h-4 inline-block mr-2" />}
                Close NCR
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EvidenceSection(props: {
  title: string;
  description: string;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  evidence: NcrEvidenceReference[];
  canUpload: boolean;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold text-gray-900 mb-1">{props.title}</h3>
      <p className="text-sm text-gray-600 mb-3">{props.description}</p>

      <div className="mb-4">
        <input
          type="file"
          multiple
          disabled={!props.canUpload}
          onChange={(e) => {
            const incoming = Array.from(e.target.files ?? []);
            props.setFiles((prev) => [...prev, ...incoming]);
          }}
          className="w-full text-sm"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={!props.canUpload || props.uploading || props.files.length < 1}
            onClick={props.onUpload}
            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-60"
          >
            {props.uploading ? 'Uploading...' : 'Upload files'}
          </button>
          {!props.canUpload && <span className="text-xs text-charcoal-500">Upload is restricted by role/assignment.</span>}
        </div>

        {props.files.length > 0 && (
          <div className="mt-2 space-y-1">
            {props.files.map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                <span className="text-sm text-charcoal-700">{f.name}</span>
                <button
                  type="button"
                  onClick={() => props.setFiles((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-critical hover:text-critical-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {props.evidence.length === 0 && <p className="text-sm text-charcoal-500">No files uploaded yet.</p>}
        {props.evidence.map((item) => (
          <EvidenceRow key={item.fileId} item={item} />
        ))}
      </div>
    </div>
  );
}

function EvidenceRow({ item }: { item: NcrEvidenceReference }) {
  const filename = item.name || 'evidence';
  const bucket = item.storageBucket ?? 'sca-evidence';
  const key = item.storageKey ?? '';

  return (
    <div className="px-3 py-2 border border-surface-200 rounded-lg flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-charcoal truncate">{filename}</p>
        <p className="text-xs text-charcoal-500 mt-0.5">{new Date(item.uploadedAt).toLocaleString('en-ZA')}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={async () => {
            if (!key) return;
            const blob = await downloadDocumentFile({ bucket, key });
            openBlobInNewTab(blob);
          }}
          className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
          aria-label="Open"
        >
          <EyeIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!key) return;
            const blob = await downloadDocumentFile({ bucket, key });
            downloadBlob(blob, filename);
          }}
          className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
          aria-label="Download"
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
          aria-label="View public URL"
        >
          <FileText className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
