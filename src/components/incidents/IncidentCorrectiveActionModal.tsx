import React, { useState, useEffect } from 'react';
import { XIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { IncidentCorrectiveAction } from '../../api/models/entities';
import {
  createIncidentCorrectiveAction,
  updateIncidentCorrectiveAction,
  type CreateIncidentCorrectiveActionInput,
  type UpdateIncidentCorrectiveActionInput
} from '../../api/services/incidentCorrectiveActionsService';
import { UserMultiSelect } from '../ui/UserMultiSelect';
import { createEvidence } from '../../api/services/evidenceService';
import { insforge } from '../../api/insforge/client';

const EVIDENCE_BUCKET = 'evidence';

export type IncidentCorrectiveActionModalProps = {
  open: boolean;
  onClose: () => void;
  incidentId: UUID;
  companyId: UUID;
  actionId?: UUID | null;
  initial?: IncidentCorrectiveAction | null;
  createdByUserId: UUID;
  onSaved?: () => void;
  /** When creating from a cause (Unsafe Act, Unsafe Condition, Root Cause, System Failure), pass to pre-fill and link */
  initialSourceCauseType?: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';
  initialSourceCauseText?: string;
};

export function IncidentCorrectiveActionModal({
  open,
  onClose,
  incidentId,
  companyId,
  actionId,
  initial,
  createdByUserId,
  onSaved,
  initialSourceCauseType,
  initialSourceCauseText
}: IncidentCorrectiveActionModalProps) {
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<UUID | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'Open' | 'In Progress' | 'Awaiting Evidence' | 'Under Review' | 'Closed'>('Open');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [closureNotes, setClosureNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setActionTitle(initial.action_title);
      setActionDescription(initial.action_description || '');
      setOwnerUserId(initial.owner_user_id);
      setDueDate(initial.due_date ? new Date(initial.due_date).toISOString().slice(0, 10) : '');
      setStatus(initial.status);
      setClosureNotes(initial.closure_notes || '');
    } else if (open && initialSourceCauseText) {
      setActionTitle(initialSourceCauseText.slice(0, 200));
      setActionDescription(initialSourceCauseType ? `Linked to: ${initialSourceCauseType.replace('_', ' ')} - ${initialSourceCauseText}` : initialSourceCauseText);
    } else {
      resetForm();
    }
  }, [initial, open, initialSourceCauseType, initialSourceCauseText]);

  function resetForm() {
    setActionTitle('');
    setActionDescription('');
    setOwnerUserId(null);
    setDueDate('');
    setStatus('Open');
    setEvidenceFiles([]);
    setClosureNotes('');
    setError(null);
  }

  function handleFileUpload(files: FileList | null) {
    if (!files) return;
    setEvidenceFiles(prev => [...prev, ...Array.from(files)]);
  }

  function removeFile(index: number) {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionTitle.trim()) {
      setError('Action title is required');
      return;
    }

    setError(null);
    try {
      setLoading(true);

      if (actionId && initial) {
        // Update existing
        const updateData: UpdateIncidentCorrectiveActionInput = {
          actionTitle: actionTitle.trim(),
          actionDescription: actionDescription.trim() || undefined,
          ownerUserId: ownerUserId || undefined,
          dueDate: dueDate || undefined,
          status,
          closureNotes: status === 'Closed' ? closureNotes.trim() || undefined : undefined
        };

        const updated = await updateIncidentCorrectiveAction(actionId, updateData);

        // Upload new evidence files
        const evidenceUrls: string[] = [...(initial.evidence_document_urls || [])];
        for (const file of evidenceFiles) {
          const key = `${companyId}/incident_corrective_action/${updated.id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
          if (uploadError) throw uploadError;

          await createEvidence({
            companyId,
            entityType: 'incident_corrective_action',
            entityId: updated.id,
            title: file.name,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId
          });

          evidenceUrls.push(key);
        }

        if (evidenceUrls.length > 0) {
          await updateIncidentCorrectiveAction(actionId, { evidenceDocumentUrls: evidenceUrls });
        }
      } else {
        // Create new
        const createData: CreateIncidentCorrectiveActionInput = {
          incidentId,
          companyId,
          actionTitle: actionTitle.trim(),
          actionDescription: actionDescription.trim() || undefined,
          ownerUserId: ownerUserId || undefined,
          dueDate: dueDate || undefined,
          createdByUserId,
          sourceCauseType: initialSourceCauseType,
          sourceCauseText: initialSourceCauseText || undefined
        };

        const created = await createIncidentCorrectiveAction(createData);

        // Upload evidence files
        const evidenceUrls: string[] = [];
        for (const file of evidenceFiles) {
          const key = `${companyId}/incident_corrective_action/${created.id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
          if (uploadError) throw uploadError;

          await createEvidence({
            companyId,
            entityType: 'incident_corrective_action',
            entityId: created.id,
            title: file.name,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId
          });

          evidenceUrls.push(key);
        }

        if (evidenceUrls.length > 0) {
          await updateIncidentCorrectiveAction(created.id, { evidenceDocumentUrls: evidenceUrls });
        }
      }

      onSaved?.();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {actionId ? 'Edit Corrective Action' : 'Create Corrective Action'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Error</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Action Title *</label>
            <input
              type="text"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="Enter action title"
              required
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Action Description</label>
            <textarea
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              rows={3}
              placeholder="Describe the corrective action..."
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Owner / Responsible Person</label>
            <UserMultiSelect
              companyId={companyId}
              selectedUserIds={ownerUserId ? [ownerUserId] : []}
              onChange={(userIds) => setOwnerUserId(userIds[0] || null)}
              placeholder="Select owner"
              allowExternalEmails={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Awaiting Evidence">Awaiting Evidence</option>
                <option value="Under Review">Under Review</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          {status === 'Closed' && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Closure Notes</label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                rows={3}
                placeholder="Enter closure notes..."
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Evidence Files</label>
            <input
              type="file"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="w-full text-sm"
            />
            {evidenceFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {evidenceFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileIcon className="w-4 h-4 text-charcoal-400" />
                      <span className="text-sm text-charcoal-600">{file.name}</span>
                      <span className="text-xs text-charcoal-400">({(file.size / 1024).toFixed(2)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-xs text-critical hover:text-critical-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !actionTitle.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              {actionId ? 'Update Action' : 'Create Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
