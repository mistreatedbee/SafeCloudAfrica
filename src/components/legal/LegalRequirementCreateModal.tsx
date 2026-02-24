import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { formatAuthError } from '../../auth/authMessages';
import type { CompanyRole } from '../../api/models/core';
import type {
  LegalComplianceStatus,
  LegalRequirement,
  LegalRequirementEvidenceLink,
  LegalRequirementReference,
  UUID
} from '../../api/models/entities';
import {
  createLegalRequirement,
  LEGAL_COMPLIANCE_OPTIONS,
  updateLegalRequirement
} from '../../api/services/legalRequirementsService';
import { SelectOrType } from '../ui/SelectOrType';
import { DocumentPicker } from '../documents/DocumentPicker';

const APPLICABILITY_DEFAULTS = [
  { id: 'all', value: 'All operations', label: 'All operations' },
  { id: 'hq', value: 'Head office', label: 'Head office' },
  { id: 'site', value: 'Site specific', label: 'Site specific' },
  { id: 'dept', value: 'Department specific', label: 'Department specific' }
];

export function LegalRequirementCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  editing?: LegalRequirement | null;
  userOptions: Array<{ userId: UUID; label: string }>;
  onSaved?: (record: LegalRequirement) => void;
}) {
  const editing = props.editing ?? null;
  const [requirementStandard, setRequirementStandard] = useState(editing?.requirement_standard ?? '');
  const [references, setReferences] = useState<LegalRequirementReference[]>(
    editing?.references?.length ? editing.references : [{ referenceText: '' }]
  );
  const [applicability, setApplicability] = useState(editing?.applicability ?? '');
  const [actionsNeeded, setActionsNeeded] = useState(editing?.actions_needed ?? '');
  const [complianceStatus, setComplianceStatus] = useState<LegalComplianceStatus>(editing?.compliance_status ?? 'PARTIALLY_COMPLIANT');
  const [responsibleUserId, setResponsibleUserId] = useState(editing?.responsible_user_id ?? '');
  const [responsibleExternalName, setResponsibleExternalName] = useState(editing?.responsible_external_name ?? '');
  const [evidenceLinks, setEvidenceLinks] = useState<LegalRequirementEvidenceLink[]>(editing?.evidence_links ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => requirementStandard.trim().length > 2, [requirementStandard]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        companyId: props.companyId,
        actorUserId: props.actorUserId,
        actorRole: props.actorRole,
        requirementStandard,
        applicability,
        actionsNeeded,
        complianceStatus,
        responsibleUserId: (responsibleUserId || null) as UUID | null,
        responsibleExternalName,
        references,
        evidenceLinks
      };

      const saved = editing
        ? await updateLegalRequirement({
            companyId: props.companyId,
            requirementId: editing.id,
            actorUserId: props.actorUserId,
            actorRole: props.actorRole,
            patch: {
              requirementStandard,
              applicability,
              actionsNeeded,
              complianceStatus,
              responsibleUserId: (responsibleUserId || null) as UUID | null,
              responsibleExternalName,
              references,
              evidenceLinks
            }
          })
        : await createLegalRequirement(payload);

      props.onSaved?.(saved);
      props.onClose();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">{editing ? 'Edit legal requirement' : 'Add legal requirement'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Legal Requirements Register</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not save requirement</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Requirement/Standard *</label>
            <textarea
              value={requirementStandard}
              onChange={(e) => setRequirementStandard(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-charcoal">Reference (Sections)</label>
            {references.map((row, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={row.referenceText}
                  onChange={(e) => {
                    const next = [...references];
                    next[idx] = { referenceText: e.target.value };
                    setReferences(next);
                  }}
                  placeholder="Section / clause reference"
                  className="flex-1 px-3 py-2 border border-surface-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => setReferences((prev) => (prev.length <= 1 ? [{ referenceText: '' }] : prev.filter((_, i) => i !== idx)))}
                  className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setReferences((prev) => [...prev, { referenceText: '' }])} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              Add reference
            </button>
          </div>

          <SelectOrType
            value={applicability}
            onChange={(value) => setApplicability(value)}
            options={APPLICABILITY_DEFAULTS}
            label="Applicability"
            placeholder="Select applicability"
            allowCreate
            companyId={props.companyId}
            moduleKey="legal"
            fieldKey="applicability"
            createdByUserId={props.actorUserId}
          />

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Actions needed</label>
            <textarea value={actionsNeeded} onChange={(e) => setActionsNeeded(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Compliance status</label>
            <select value={complianceStatus} onChange={(e) => setComplianceStatus(e.target.value as LegalComplianceStatus)} className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm">
              {LEGAL_COMPLIANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <DocumentPicker companyId={props.companyId} value={evidenceLinks} onChange={setEvidenceLinks} label="Compliance Evidence" />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-charcoal">Responsible person</label>
            <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm">
              <option value="">Select user (or type external name below)</option>
              {props.userOptions.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.label}
                </option>
              ))}
            </select>
            <input
              value={responsibleExternalName}
              onChange={(e) => setResponsibleExternalName(e.target.value)}
              placeholder="Type external responsible person"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 disabled:opacity-60">
              {loading ? 'Saving...' : editing ? 'Save changes' : 'Add requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
