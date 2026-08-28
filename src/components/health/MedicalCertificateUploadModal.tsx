import React, { useEffect, useMemo, useState } from 'react';
import { XIcon, UploadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { MedicalCertificate, UUID } from '../../api/models/entities';
import { createMedicalCertificate } from '../../api/services/healthService';
import { uploadFile, type StorageBucket } from '../../api/services/storageService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export const MEDICAL_CERT_BUCKET = 'sca-medical-certificates';

export function MedicalCertificateUploadModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  defaultUserId?: UUID;
  onUploaded?: () => void;
}) {
  const { restoreLatestDraftByPrefix, restoreDraft, clearDraft } = useDraftManager();
  const [userId, setUserId] = useState(props.defaultUserId ?? '');
  const [certificateType, setCertificateType] = useState('Fitness Certificate');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [status, setStatus] = useState<MedicalCertificate['status']>('valid');
  const [file, setFile] = useState<File | null>(null);
  const [fileMetaName, setFileMetaName] = useState<string>('');
  const [fileMetaType, setFileMetaType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftKeyPrefix = `medical-certificate-upload:${props.companyId}:${props.actorUserId}:`;
  const defaultUserDraftKey = props.defaultUserId ? `${draftKeyPrefix}${props.defaultUserId.trim()}` : null;
  const draftKey = `${draftKeyPrefix}${(props.defaultUserId ?? userId).trim() || 'anon'}`;

  const canSubmit = useMemo(() => !!userId && certificateType.trim().length > 2, [certificateType, userId]);

  const hasDirtyDraft = useMemo(() => {
    return (
      props.open &&
      (certificateType.trim().length > 0 ||
        issuedAt.trim().length > 0 ||
        expiresAt.trim().length > 0 ||
        status !== 'valid' ||
        !!userId.trim() ||
        !!fileMetaName)
    );
  }, [certificateType, expiresAt, fileMetaName, issuedAt, props.open, status, userId]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      userId,
      certificateType,
      issuedAt,
      expiresAt,
      status,
      fileMetaName: fileMetaName || null,
      fileMetaType: fileMetaType || null
    })
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = props.defaultUserId
      ? restoreDraft<{
          userId?: string;
          certificateType?: string;
          issuedAt?: string;
          expiresAt?: string;
          status?: MedicalCertificate['status'];
          fileMetaName?: string | null;
          fileMetaType?: string | null;
        }>(defaultUserDraftKey as string)
      : restoreLatestDraftByPrefix<{
          userId?: string;
          certificateType?: string;
          issuedAt?: string;
          expiresAt?: string;
          status?: MedicalCertificate['status'];
          fileMetaName?: string | null;
          fileMetaType?: string | null;
        }>(draftKeyPrefix)?.payload ?? null;

    if (!restored) return;

    setUserId(restored.userId ?? props.defaultUserId ?? '');
    setCertificateType(restored.certificateType ?? 'Fitness Certificate');
    setIssuedAt(restored.issuedAt ?? '');
    setExpiresAt(restored.expiresAt ?? '');
    setStatus(restored.status ?? 'valid');

    // File objects cannot be restored. Keep metadata so the user can confirm what was selected.
    setFile(null);
    setFileMetaName(restored.fileMetaName ?? '');
    setFileMetaType(restored.fileMetaType ?? '');
  }, [defaultUserDraftKey, draftKeyPrefix, props.defaultUserId, props.open, restoreDraft, restoreLatestDraftByPrefix]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      let bucket: StorageBucket | null = null;
      let key: string | null = null;
      if (file) {
        bucket = MEDICAL_CERT_BUCKET;
        key = `${props.companyId}/${userId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const uploadResult = await uploadFile(bucket, file, { key });
        key = uploadResult.key;
      }

      await createMedicalCertificate({
        companyId: props.companyId,
        userId: userId as UUID,
        certificateType: certificateType.trim(),
        issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        status,
        certificateBucket: bucket,
        certificateKey: key,
        createdByUserId: props.actorUserId
      });

      props.onUploaded?.();
      props.onClose();
      setCertificateType('Fitness Certificate');
      setIssuedAt('');
      setExpiresAt('');
      setStatus('valid');
      setFile(null);
      setFileMetaName('');
      setFileMetaType('');
      clearDraft(draftKey);
      if (!props.defaultUserId) setUserId('');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Upload medical certificate</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Uploads the file and creates a medical certificate record.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Upload failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {!props.defaultUserId && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">User ID (UUID)</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Paste employee UUID"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Certificate type</label>
              <input
                value={certificateType}
                onChange={(e) => setCertificateType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MedicalCertificate['status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="valid">valid</option>
                <option value="expiring">expiring</option>
                <option value="expired">expired</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issued date (optional)</label>
              <input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Expiry date (optional)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">File (optional)</label>
            <input
              type="file"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setFileMetaName(next?.name ?? '');
                setFileMetaType(next?.type ?? '');
              }}
              className="w-full text-sm"
            />
            {fileMetaName && !file && (
              <p className="text-xs text-charcoal-400 mt-1">Previously selected file: {fileMetaName} (reselect to upload)</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <LoadingSpinner size={16} /> : <UploadIcon className="w-4 h-4" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
