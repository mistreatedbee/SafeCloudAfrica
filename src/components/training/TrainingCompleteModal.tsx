import React, { useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { TrainingRecord, TrainingCourse, UUID } from '../../api/models/entities';
import { updateTrainingRecord } from '../../api/services/trainingService';
import { insforge } from '../../api/insforge/client';
import { TRAINING_CERT_BUCKET } from './TrainingAddModal';

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
    if (!file) {
      setError('Certificate upload is required to mark training as completed.');
      return;
    }
    setError(null);
    try {
      setLoading(true);
      const key = `${props.companyId}/${props.record.user_id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const { data: uploadData, error: upErr } = await insforge.storage.from(TRAINING_CERT_BUCKET).upload(key, file);
      if (upErr) throw upErr;
      const certificateKey = uploadData?.path ?? key;

      await updateTrainingRecord({
        companyId: props.companyId,
        recordId: props.record.id,
        status: 'COMPLETED',
        completedAt: new Date(completedAt).toISOString(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : suggestedExpiry ? new Date(suggestedExpiry).toISOString() : null,
        certificateBucket: TRAINING_CERT_BUCKET,
        certificateKey,
        cost: cost ? parseFloat(cost) || null : props.record.cost
      });
      props.onSaved?.();
      props.onClose();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Mark training completed</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
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
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm"
            />
            {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
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
