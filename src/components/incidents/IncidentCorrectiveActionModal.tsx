import React, { useEffect, useMemo, useState } from 'react';
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

type CauseLinkType = 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';

type CauseOption = {
  type: CauseLinkType;
  text: string;
  label: string;
};

export type IncidentCorrectiveActionModalProps = {
  open: boolean;
  onClose: () => void;
  incidentId: UUID;
  companyId: UUID;
  actionId?: UUID | null;
  initial?: IncidentCorrectiveAction | null;
  createdByUserId: UUID;
  onSaved?: () => void;
  initialSourceCauseType?: CauseLinkType;
  initialSourceCauseText?: string;
  causeOptions?: CauseOption[];
};

function parseCauseLinks(rawType?: CauseLinkType | null, rawText?: string | null): CauseOption[] {
  const text = String(rawText ?? '').trim();
  if (!text && !rawType) return [];
  const parsed = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [typePart, ...rest] = line.split(':');
      const normalizedType = String(typePart || '').trim() as CauseLinkType;
      const value = rest.join(':').trim();
      if (!value) return null;
      if (!['unsafe_act', 'unsafe_condition', 'root_cause', 'system_failure'].includes(normalizedType)) {
        return {
          type: (rawType ?? 'root_cause') as CauseLinkType,
          text: line,
          label: line
        };
      }
      return {
        type: normalizedType,
        text: value,
        label: `${normalizedType.replace('_', ' ')}: ${value}`
      };
    })
    .filter(Boolean) as CauseOption[];

  if (parsed.length > 0) return parsed;
  return [{
    type: (rawType ?? 'root_cause') as CauseLinkType,
    text: text || 'Unspecified link',
    label: `${String(rawType ?? 'root_cause').replace('_', ' ')}: ${text || 'Unspecified link'}`
  }];
}

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
  initialSourceCauseText,
  causeOptions = []
}: IncidentCorrectiveActionModalProps) {
  const [actionRequired, setActionRequired] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState<UUID | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'Open' | 'In Progress' | 'Awaiting Evidence' | 'Under Review' | 'Closed'>('Open');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [closureNotes, setClosureNotes] = useState('');
  const [selectedLinks, setSelectedLinks] = useState<CauseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCauseOptions = useMemo(() => {
    const mapped = causeOptions
      .filter((option) => option.text.trim())
      .map((option) => ({ ...option, label: option.label || `${option.type.replace('_', ' ')}: ${option.text}` }));
    const unique = new Map<string, CauseOption>();
    for (const option of mapped) unique.set(`${option.type}|${option.text}`, option);
    return Array.from(unique.values());
  }, [causeOptions]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setActionRequired(initial.action_title);
      setActionDescription(initial.action_description || '');
      setResponsibleUserId(initial.owner_user_id);
      setDueDate(initial.due_date ? new Date(initial.due_date).toISOString().slice(0, 10) : '');
      setStatus(initial.status);
      setClosureNotes(initial.closure_notes || '');
      setSelectedLinks(parseCauseLinks(initial.source_cause_type ?? null, initial.source_cause_text ?? null));
      return;
    }

    setActionRequired(initialSourceCauseText?.slice(0, 200) || '');
    setActionDescription(initialSourceCauseText ? `Linked finding: ${initialSourceCauseText}` : '');
    setResponsibleUserId(null);
    setDueDate('');
    setStatus('Open');
    setEvidenceFiles([]);
    setClosureNotes('');
    setError(null);
    setSelectedLinks(initialSourceCauseText
      ? [{
          type: (initialSourceCauseType ?? 'root_cause') as CauseLinkType,
          text: initialSourceCauseText,
          label: `${String(initialSourceCauseType ?? 'root_cause').replace('_', ' ')}: ${initialSourceCauseText}`
        }]
      : []);
  }, [initial, open, initialSourceCauseType, initialSourceCauseText]);

  function handleFileUpload(files: FileList | null) {
    if (!files) return;
    setEvidenceFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removeFile(index: number) {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleCauseLink(option: CauseOption, selected: boolean) {
    setSelectedLinks((prev) => {
      const key = `${option.type}|${option.text}`;
      if (selected) {
        if (prev.some((entry) => `${entry.type}|${entry.text}` === key)) return prev;
        return [...prev, option];
      }
      return prev.filter((entry) => `${entry.type}|${entry.text}` !== key);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionRequired.trim()) {
      setError('Action Required is mandatory.');
      return;
    }
    if (!responsibleUserId) {
      setError('Responsible Person is mandatory.');
      return;
    }
    if (!dueDate) {
      setError('Due Date is mandatory.');
      return;
    }

    setError(null);
    try {
      setLoading(true);

      const sourceCauseType = selectedLinks[0]?.type;
      const sourceCauseText = selectedLinks.length
        ? selectedLinks.map((link) => `${link.type}: ${link.text}`).join('\n')
        : undefined;

      if (actionId && initial) {
        const updateData: UpdateIncidentCorrectiveActionInput = {
          actionTitle: actionRequired.trim(),
          actionDescription: actionDescription.trim() || undefined,
          ownerUserId: responsibleUserId,
          dueDate,
          status,
          closureNotes: status === 'Closed' ? closureNotes.trim() || undefined : undefined,
          sourceCauseType,
          sourceCauseText: sourceCauseText ?? null
        };

        const updated = await updateIncidentCorrectiveAction(companyId, actionId, updateData);
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
          await updateIncidentCorrectiveAction(companyId, actionId, { evidenceDocumentUrls: evidenceUrls });
        }
      } else {
        const createData: CreateIncidentCorrectiveActionInput = {
          incidentId,
          companyId,
          actionTitle: actionRequired.trim(),
          actionDescription: actionDescription.trim() || undefined,
          ownerUserId: responsibleUserId,
          dueDate,
          createdByUserId,
          sourceCauseType,
          sourceCauseText
        };

        const created = await createIncidentCorrectiveAction(createData);
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
          await updateIncidentCorrectiveAction(companyId, created.id, { evidenceDocumentUrls: evidenceUrls });
        }
      }

      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <p className="text-sm font-semibold text-charcoal">{actionId ? 'Edit Corrective Action' : 'Create Corrective Action'}</p>
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Action Required *</label>
            <input
              type="text"
              value={actionRequired}
              onChange={(e) => setActionRequired(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Action Description</label>
            <textarea
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible Person *</label>
            <UserMultiSelect
              companyId={companyId}
              selectedUserIds={responsibleUserId ? [responsibleUserId] : []}
              onChange={(userIds) => setResponsibleUserId(userIds[0] || null)}
              placeholder="Select responsible person"
              allowExternalEmails={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Awaiting Evidence">Awaiting Evidence</option>
                <option value="Under Review">Under Review</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Link to Investigation Causes</label>
            {availableCauseOptions.length === 0 ? (
              <p className="text-xs text-charcoal-500">No saved causes available yet. Save investigation causes first.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto border border-surface-200 rounded-lg p-3">
                {availableCauseOptions.map((option) => {
                  const checked = selectedLinks.some((entry) => entry.type === option.type && entry.text === option.text);
                  return (
                    <label key={`${option.type}|${option.text}`} className="flex items-start gap-2 text-sm text-charcoal">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleCauseLink(option, e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {status === 'Closed' && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Closure Notes</label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Evidence Files</label>
            <input type="file" multiple onChange={(e) => handleFileUpload(e.target.files)} className="w-full text-sm" />
            {evidenceFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {evidenceFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileIcon className="w-4 h-4 text-charcoal-400" />
                      <span className="text-sm text-charcoal-600">{file.name}</span>
                    </div>
                    <button type="button" onClick={() => removeFile(index)} className="text-xs text-critical hover:text-critical-600">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !actionRequired.trim() || !dueDate || !responsibleUserId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
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
