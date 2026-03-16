import React, { useEffect, useMemo, useState } from 'react';
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
import { listDocuments } from '../../api/services/documentsService';
import { listRiskAssessments, type RiskAssessment } from '../../api/services/riskAssessmentsService';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { SelectOrType } from '../ui/SelectOrType';
import { DocumentPicker } from '../documents/DocumentPicker';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';

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
  const [finding, setFinding] = useState(editing?.finding ?? '');
  const [targetDate, setTargetDate] = useState(editing?.target_date ?? '');
  const [complianceStatus, setComplianceStatus] = useState<LegalComplianceStatus>(editing?.compliance_status ?? 'PARTIALLY_COMPLIANT');
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<UUID | ''>(
    (editing?.responsible_employee_id ?? '') as UUID | ''
  );
  const [responsibleExternalName, setResponsibleExternalName] = useState(editing?.responsible_external_name ?? '');
  const [evidenceLinks, setEvidenceLinks] = useState<LegalRequirementEvidenceLink[]>(editing?.evidence_links ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [linkedDocumentId, setLinkedDocumentId] = useState<string>(
    editing?.links?.find((l) => l.linked_module_type === 'document')?.linked_record_id ?? ''
  );
  const [linkedRiskAssessmentId, setLinkedRiskAssessmentId] = useState<string>(
    editing?.links?.find((l) => l.linked_module_type === 'risk_assessment')?.linked_record_id ?? ''
  );
  const [linkedNcrId, setLinkedNcrId] = useState<string>(
    editing?.links?.find((l) => l.linked_module_type === 'ncr')?.linked_record_id ?? ''
  );

  const [documents, setDocuments] = useState<Array<{ id: UUID; title: string }>>([]);
  const [riskAssessments, setRiskAssessments] = useState<RiskAssessment[]>([]);
  const [ncrs, setNcrs] = useState<Array<{ id: UUID; nc_number: string | null; title: string }>>([]);

  const [documentSearch, setDocumentSearch] = useState('');
  const [riskSearch, setRiskSearch] = useState('');
  const [ncrSearch, setNcrSearch] = useState('');

  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const canSubmit = useMemo(
    () => requirementStandard.trim().length > 2 && finding.trim().length > 0,
    [requirementStandard, finding]
  );

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    (async () => {
      try {
        const [docRows, raRows, ncrRows] = await Promise.all([
          listDocuments(props.companyId),
          listRiskAssessments({
            companyId: props.companyId,
            actorUserId: props.actorUserId,
            actorRole: props.actorRole,
            limit: 200
          }),
          listQualityNcrs({
            companyId: props.companyId,
            limit: 200
          })
        ]);
        if (cancelled) return;
        setDocuments(docRows.map((d) => ({ id: d.id, title: d.title })));
        setRiskAssessments(raRows);
        setNcrs(ncrRows.map((n) => ({ id: n.id, nc_number: n.nc_number ?? null, title: n.title })));
      } catch {
        // Non-fatal: linking dropdowns will just be empty if loading fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.companyId, props.actorUserId, props.actorRole]);

  const filteredDocuments = useMemo(
    () =>
      documents.filter((d) =>
        documentSearch.trim()
          ? d.title.toLowerCase().includes(documentSearch.trim().toLowerCase())
          : true
      ),
    [documents, documentSearch]
  );

  const filteredRiskAssessments = useMemo(
    () =>
      riskAssessments.filter((r) => {
        if (!riskSearch.trim()) return true;
        const term = riskSearch.trim().toLowerCase();
        return (
          (r.title ?? '').toLowerCase().includes(term) ||
          (r.heading ?? '').toLowerCase().includes(term) ||
          (r.reference ?? '').toLowerCase().includes(term)
        );
      }),
    [riskAssessments, riskSearch]
  );

  const filteredNcrs = useMemo(
    () =>
      ncrs.filter((n) => {
        if (!ncrSearch.trim()) return true;
        const term = ncrSearch.trim().toLowerCase();
        return (
          (n.nc_number ?? '').toLowerCase().includes(term) ||
          (n.title ?? '').toLowerCase().includes(term)
        );
      }),
    [ncrs, ncrSearch]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const linkIds = [linkedDocumentId, linkedRiskAssessmentId, linkedNcrId].filter((v) => v);
      if (linkIds.length > 2) {
        throw new Error('You can only link up to two records per legal requirement.');
      }

      const links =
        linkIds.length === 0
          ? []
          : [
              linkedDocumentId
                ? { linkedModuleType: 'document', linkedRecordId: linkedDocumentId as UUID }
                : null,
              linkedRiskAssessmentId
                ? { linkedModuleType: 'risk_assessment', linkedRecordId: linkedRiskAssessmentId as UUID }
                : null,
              linkedNcrId ? { linkedModuleType: 'ncr', linkedRecordId: linkedNcrId as UUID } : null
            ].filter((x): x is { linkedModuleType: 'document' | 'risk_assessment' | 'ncr'; linkedRecordId: UUID } => Boolean(x));

      if (targetDate) {
        const target = new Date(targetDate);
        if (Number.isNaN(target.getTime())) {
          throw new Error('Target date is invalid.');
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const targetOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        if (targetOnly.getTime() < today.getTime()) {
          throw new Error('Target date cannot be in the past.');
        }
      }

      const payload = {
        companyId: props.companyId,
        actorUserId: props.actorUserId,
        actorRole: props.actorRole,
        requirementStandard,
        applicability,
        actionsNeeded,
        finding,
        targetDate: targetDate || null,
        complianceStatus,
        responsibleEmployeeId: (responsibleEmployeeId || null) as UUID | null,
        responsibleExternalName,
        references,
        evidenceLinks,
        links
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
              finding,
              targetDate: targetDate || null,
              complianceStatus,
              responsibleEmployeeId: (responsibleEmployeeId || null) as UUID | null,
              responsibleExternalName,
              references,
              evidenceLinks,
              links
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Finding *</label>
            <textarea
              value={finding}
              onChange={(e) => setFinding(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
            />
          </div>

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

          <div className="space-y-3">
            <p className="text-sm font-medium text-charcoal">Link Records (max 2)</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Link to Document</label>
                <input
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full mb-1 px-3 py-1.5 border border-surface-300 rounded-lg text-xs"
                />
                <select
                  value={linkedDocumentId}
                  onChange={(e) => setLinkedDocumentId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">No linked document</option>
                  {filteredDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Link to Risk Assessment</label>
                <input
                  value={riskSearch}
                  onChange={(e) => setRiskSearch(e.target.value)}
                  placeholder="Search risk assessments..."
                  className="w-full mb-1 px-3 py-1.5 border border-surface-300 rounded-lg text-xs"
                />
                <select
                  value={linkedRiskAssessmentId}
                  onChange={(e) => setLinkedRiskAssessmentId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">No linked risk assessment</option>
                  {filteredRiskAssessments.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.reference ? `${r.reference} – ${r.title}` : r.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Link to NCR</label>
                <input
                  value={ncrSearch}
                  onChange={(e) => setNcrSearch(e.target.value)}
                  placeholder="Search NCRs..."
                  className="w-full mb-1 px-3 py-1.5 border border-surface-300 rounded-lg text-xs"
                />
                <select
                  value={linkedNcrId}
                  onChange={(e) => setLinkedNcrId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">No linked NCR</option>
                  {filteredNcrs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nc_number ? `${n.nc_number} – ${n.title}` : n.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-charcoal">Responsible person</label>
            <HrEmployeeSelect
              companyId={props.companyId}
              value={responsibleEmployeeId}
              onChange={(id) => setResponsibleEmployeeId(id)}
              placeholder="Select employee (or type external name below)"
            />
            <input
              value={responsibleExternalName}
              onChange={(e) => setResponsibleExternalName(e.target.value)}
              placeholder="Type external responsible person"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={todayIso}
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
