import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { TrainingRecord, TrainingCourse, UUID } from '../../api/models/entities';
import { updateTrainingRecord } from '../../api/services/trainingService';
import { insforge } from '../../api/insforge/client';
import { TRAINING_CERT_BUCKET } from './TrainingAddModal';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function TrainingCompleteModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  record: TrainingRecord;
  course: TrainingCourse | null;
  onSaved?: () => void;
}) {
  const [completedAt, setCompletedAt] = useState(
    props.record.completed_at ? props.record.completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [expiresAt, setExpiresAt] = useState(
    props.record.expires_at ? props.record.expires_at.slice(0, 10) : ''
  );
  const [cost, setCost] = useState<string>(props.record.cost != null ? String(props.record.cost) : '');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type TrainingCompleteDraftPayload = {
    completedAt: string;
    expiresAt: string;
    cost: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-complete:${props.companyId}:${props.record.id}`;

  const [completeBaseline, setCompleteBaseline] = useState<TrainingCompleteDraftPayload>(() => ({
    completedAt: props.record.completed_at ? props.record.completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    expiresAt: props.record.expires_at ? props.record.expires_at.slice(0, 10) : '',
    cost: props.record.cost != null ? String(props.record.cost) : ''
  }));

  const hasDirtyDraft = useMemo(() => {
    return JSON.stringify({ completedAt, expiresAt, cost }) !== JSON.stringify(completeBaseline);
  }, [completeBaseline, cost, completedAt, expiresAt]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        completedAt,
        expiresAt,
        cost
      }) satisfies TrainingCompleteDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<TrainingCompleteDraftPayload>(draftKey);
    if (!restored) {
      const nextBaseline = {
        completedAt: props.record.completed_at ? props.record.completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        expiresAt: props.record.expires_at ? props.record.expires_at.slice(0, 10) : '',
        cost: props.record.cost != null ? String(props.record.cost) : ''
      };
      setCompletedAt(nextBaseline.completedAt);
      setExpiresAt(nextBaseline.expiresAt);
      setCost(nextBaseline.cost);
      setCompleteBaseline(nextBaseline);
      setFile(null);
      setError(null);
      return;
    }

    setCompletedAt(restored.completedAt ?? '');
    setExpiresAt(restored.expiresAt ?? '');
    setCost(restored.cost ?? '');
    setCompleteBaseline(restored);
    setFile(null);
    setError(null);
  }, [draftKey, props.open, props.record.completed_at, props.record.cost, props.record.expires_at, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  const validityMonths = props.course?.default_validity_months ?? props.course?.valid_months;

  const suggestedExpiry = (() => {
    if (expiresAt) return null;
    if (!completedAt || !validityMonths) return null;
    const d = new Date(completedAt);
    d.setMonth(d.getMonth() + validityMonths);
    return d.toISOString().slice(0, 10);
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && !(props.record.certificate_bucket && props.record.certificate_key)) {
      setError('Certificate upload is required to mark training as completed.');
      return;
    }
    setError(null);
    try {
      setLoading(true);
      let certificateBucket = props.record.certificate_bucket ?? null;
      let certificateKey = props.record.certificate_key ?? null;
      if (file) {
        const allowedExtensions = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.includes(ext)) {
          setError('Unsupported certificate file type. Please upload PDF, DOCX, or image formats.');
          setLoading(false);
          return;
        }
        const key = `${props.companyId}/${props.record.user_id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const { data: uploadData, error: upErr } = await insforge.storage.from(TRAINING_CERT_BUCKET).upload(key, file);
        if (upErr) throw upErr;
        certificateBucket = TRAINING_CERT_BUCKET;
        certificateKey = uploadData?.path ?? key;
      }

      await updateTrainingRecord({
        companyId: props.companyId,
        recordId: props.record.id,
        status: 'COMPLETED',
        completedAt: new Date(completedAt).toISOString(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : suggestedExpiry ? new Date(suggestedExpiry).toISOString() : null,
        certificateBucket,
        certificateKey,
        cost: cost ? parseFloat(cost) || null : props.record.cost
      });
      props.onSaved?.();
      clearDraft(draftKey);
      props.onClose();
    } catch (err: unknown) {
      setError(toUserFacingError(err, formatAuthError(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWithDraftClear();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // closeWithDraftClear is stable, safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Mark training completed</p>
          <button
            type="button"
            onClick={closeWithDraftClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm text-critical">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Completed date *</label>
            <input
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Expiry date</label>
            <input
              type="date"
              value={expiresAt || suggestedExpiry || ''}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            {suggestedExpiry && !expiresAt && (
              <p className="text-xs text-charcoal-500 mt-1">Suggested from course validity ({validityMonths} months)</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Cost (ZAR, optional)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Certificate file * (required to complete)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {!file && props.record.certificate_bucket && props.record.certificate_key && (
              <p className="text-xs text-charcoal-500 mt-1">
                Existing certificate will be kept unless you upload a replacement.
              </p>
            )}
            {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeWithDraftClear} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {loading && <LoadingSpinner size={16} />}
              Mark completed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
