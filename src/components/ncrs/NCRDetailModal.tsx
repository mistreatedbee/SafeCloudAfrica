import { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle, AlertTriangle, FileText, EyeIcon, DownloadIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { NcrEvidenceReference, QualityNcr, UUID } from '../../api/models/entities';
import { formatAuthError } from '../../auth/authMessages';
import { createEvidence } from '../../api/services/evidenceService';
import { listNcrEvidence, syncNcrEvidenceFromAttachments } from '../../api/services/qualityNcrsService';
import { insforge } from '../../api/insforge/client';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../../api/services/documentsStorageService';
import { LoadingSpinner } from '../ui/LoadingSpinner';

const EVIDENCE_BUCKET = 'sca-evidence';

type EvidenceKind = 'BEFORE' | 'AFTER';

interface NCRDetailModalProps {
  ncr: QualityNcr;
  companyId: UUID;
  actorUserId: UUID;
  canCloseNcr: boolean;
  canUploadEvidence: boolean;
  onClose: () => void;
  onCloseNCR: (ncrId: UUID) => Promise<void>;
  onNcrUpdated: (ncr: QualityNcr) => void;
}

export default function NCRDetailModal({
  ncr,
  companyId,
  actorUserId,
  canCloseNcr,
  canUploadEvidence,
  onClose,
  onCloseNCR,
  onNcrUpdated
}: NCRDetailModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<EvidenceKind | null>(null);
  const [filesBefore, setFilesBefore] = useState<File[]>([]);
  const [filesAfter, setFilesAfter] = useState<File[]>([]);
  const [closing, setClosing] = useState(false);
  const [loadedBefore, setLoadedBefore] = useState<NcrEvidenceReference[] | null>(null);
  const [loadedAfter, setLoadedAfter] = useState<NcrEvidenceReference[] | null>(null);

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
    const load = async () => {
      try {
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
      for (const file of queue) {
        const key = `${companyId}/ncr/${ncr.id}/${kind.toLowerCase()}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const { data: uploaded, error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
        if (uploadError) throw uploadError;

        await createEvidence({
          companyId,
          entityType: 'ncr',
          entityId: ncr.id,
          storageBucket: EVIDENCE_BUCKET,
          storageKey: uploaded?.path ?? key,
          createdByUserId: actorUserId,
          originalFilename: file.name,
          displayTitle: file.name,
          fileKind: kind
        });
      }

      const synced = await syncNcrEvidenceFromAttachments(companyId, ncr.id);
      onNcrUpdated(synced);
      setLoadedBefore((synced.evidence_before ?? []) as NcrEvidenceReference[]);
      setLoadedAfter((synced.evidence_after ?? []) as NcrEvidenceReference[]);
      if (kind === 'BEFORE') setFilesBefore([]);
      if (kind === 'AFTER') setFilesAfter([]);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleCloseClick() {
    if (!canCloseNcr) {
      setError('Only Supervisor/Admin roles can close an NCR.');
      return;
    }

    setError(null);
    setClosing(true);
    try {
      if (evidenceAfter.length < 1) {
        const latestEvidence = await listNcrEvidence(companyId, ncr.id);
        if (latestEvidence.evidenceAfter.length < 1) {
          throw new Error('Evidence of Closure is required before closing this NCR.');
        }
      }
      await onCloseNCR(ncr.id);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setClosing(false);
    }
  }

  const linkedRequirementTypeLabel =
    ncr.linked_requirement_type === 'STANDARD'
      ? 'Standard'
      : ncr.linked_requirement_type === 'POLICY'
      ? 'Policy'
      : ncr.linked_requirement_type === 'PROCEDURE'
      ? 'Procedure'
      : 'Not set';

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
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{ncr.nc_number}</h2>
            <p className="text-sm text-gray-600 mt-1">{ncr.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-critical/5 border border-critical/20 rounded-lg">
              <p className="text-sm text-critical font-semibold">NCR action failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p className="text-sm text-gray-600">Linked to requirement type</p>
              <p className="font-medium text-gray-900">{linkedRequirementTypeLabel}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Linked Requirement</p>
              <p className="font-medium text-gray-900">{ncr.linked_requirement || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Before evidence uploaded</p>
              <p className="font-medium text-gray-900">{evidenceBefore.length > 0 ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Closure evidence uploaded</p>
              <p className="font-medium text-gray-900">{evidenceAfter.length > 0 ? 'Yes' : 'No'}</p>
            </div>
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

          <div className="border-t pt-4 flex gap-3">
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
