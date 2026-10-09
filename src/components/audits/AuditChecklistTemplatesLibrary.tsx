import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, XIcon, Trash2Icon } from 'lucide-react';
import type { AuditChecklistTemplate, UUID } from '../../api/models/entities';
import { createAuditChecklistTemplate, listAuditChecklistTemplates } from '../../api/services/auditChecklistTemplatesService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useUser } from '@insforge/react';

type Props = {
  companyId: UUID;
  canManage: boolean;
};

type ComplianceOption = 'C' | 'PC' | 'NC' | 'Obs' | 'N/A';

type SectionDraft = {
  id: string;
  isoClause: string;
  title: string;
  /** UI grouping only -- audit_checklist_templates.questions is a flat array
      (importAuditChecklistFromTemplate reads a plain `section` text label per
      question, not a section hierarchy), so a sub-section's questions are saved
      under a combined "Parent / Sub-section" label rather than a real nested
      relationship. */
  parentId: string | null;
};

type QuestionDraft = {
  id: string;
  sectionId: string | null;
  question: string;
  expectedEvidence: string;
  allocatedScore: string;
  complianceStatus: ComplianceOption | '';
};

function sectionLabel(section: SectionDraft, byId: Map<string, SectionDraft>): string {
  const clause = section.isoClause.trim();
  const title = section.title.trim();
  const own = clause ? `${clause} — ${title}` : title;
  if (!section.parentId) return own;
  const parent = byId.get(section.parentId);
  if (!parent) return own;
  return `${sectionLabel(parent, byId)} / ${title}`;
}

function newSection(parentId: string | null = null): SectionDraft {
  return { id: crypto.randomUUID(), isoClause: '', title: '', parentId };
}

function newQuestion(sectionId: string | null): QuestionDraft {
  return { id: crypto.randomUUID(), sectionId, question: '', expectedEvidence: '', allocatedScore: '1', complianceStatus: '' };
}

export function AuditChecklistTemplatesLibrary({ companyId, canManage }: Props) {
  const { user } = useUser();
  const [templates, setTemplates] = useState<AuditChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listAuditChecklistTemplates(companyId));
    } catch (err: any) {
      setError(err.message ?? 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [companyId]);

  const sectionsById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const totalScore = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.allocatedScore) || 0), 0),
    [questions]
  );

  function openNew() {
    setName('');
    setSections([]);
    setQuestions([]);
    setError(null);
    setEditing(true);
  }

  function addSection(parentId: string | null = null) {
    setSections((prev) => [...prev, newSection(parentId)]);
  }

  function updateSection(id: string, patch: Partial<SectionDraft>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSection(id: string) {
    const childIds = new Set<string>([id]);
    // Also drop any sub-sections nested under this one.
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of sections) {
        if (s.parentId && childIds.has(s.parentId) && !childIds.has(s.id)) {
          childIds.add(s.id);
          changed = true;
        }
      }
    }
    setSections((prev) => prev.filter((s) => !childIds.has(s.id)));
    setQuestions((prev) => prev.map((q) => (q.sectionId && childIds.has(q.sectionId) ? { ...q, sectionId: null } : q)));
  }

  function addQuestion(sectionId: string | null) {
    setQuestions((prev) => [...prev, newQuestion(sectionId)]);
  }

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function saveTemplate() {
    if (!name.trim() || !user?.id) return;
    const parsed = questions
      .map((q) => ({
        question: q.question.trim(),
        section: q.sectionId ? sectionLabel(sectionsById.get(q.sectionId)!, sectionsById) : undefined,
        allocated_score: Number(q.allocatedScore) || 1,
        expected_evidence: q.expectedEvidence.trim() || undefined,
        compliance_status: q.complianceStatus || undefined
      }))
      .filter((q) => q.question.length > 0);

    if (parsed.length === 0) {
      setError('Add at least one question.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAuditChecklistTemplate({
        companyId,
        name: name.trim(),
        sections: sections.map((s) => ({
          id: s.id,
          iso_clause: s.isoClause.trim() || null,
          title: s.title.trim(),
          parent_section_id: s.parentId
        })),
        questions: parsed,
        createdByUserId: user.id as UUID
      });
      setEditing(false);
      setName('');
      setSections([]);
      setQuestions([]);
      await refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  const topLevelSections = sections.filter((s) => !s.parentId);

  function renderSection(section: SectionDraft, depth: number) {
    const childSections = sections.filter((s) => s.parentId === section.id);
    const sectionQuestions = questions.filter((q) => q.sectionId === section.id);
    return (
      <div key={section.id} className={depth > 0 ? 'ml-5 mt-3 pl-3 border-l-2 border-surface-200' : 'mt-3'}>
        <div className="flex items-start gap-2 bg-surface-50 border border-surface-200 rounded-lg p-2.5">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={section.isoClause}
              onChange={(e) => updateSection(section.id, { isoClause: e.target.value })}
              placeholder="ISO clause (e.g. 4.3)"
              className="px-2 py-1.5 border border-surface-300 rounded text-xs"
            />
            <input
              value={section.title}
              onChange={(e) => updateSection(section.id, { title: e.target.value })}
              placeholder="Section title *"
              className="sm:col-span-2 px-2 py-1.5 border border-surface-300 rounded text-xs font-medium"
            />
          </div>
          <button
            type="button"
            onClick={() => removeSection(section.id)}
            aria-label="Delete section"
            className="p-1.5 rounded hover:bg-critical/10 text-charcoal-400 hover:text-critical shrink-0"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>

        {sectionQuestions.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-charcoal-500">
                  <th className="py-1 pr-2 text-left">Question</th>
                  <th className="py-1 pr-2 text-left">Evidence reviewed</th>
                  <th className="py-1 pr-2 text-left w-20">Score</th>
                  <th className="py-1 pr-2 text-left w-24">Compliance</th>
                  <th className="py-1 text-left w-8" />
                </tr>
              </thead>
              <tbody>
                {sectionQuestions.map((q) => (
                  <tr key={q.id} className="border-t border-surface-100 align-top">
                    <td className="py-1.5 pr-2">
                      <textarea
                        value={q.question}
                        onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                        placeholder="Question text *"
                        rows={2}
                        className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <textarea
                        value={q.expectedEvidence}
                        onChange={(e) => updateQuestion(q.id, { expectedEvidence: e.target.value })}
                        placeholder="e.g. signed register"
                        rows={2}
                        className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={q.allocatedScore}
                        onChange={(e) => updateQuestion(q.id, { allocatedScore: e.target.value })}
                        className="w-16 px-2 py-1 border border-surface-300 rounded text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={q.complianceStatus}
                        onChange={(e) => updateQuestion(q.id, { complianceStatus: e.target.value as ComplianceOption | '' })}
                        className="w-full px-1.5 py-1 border border-surface-300 rounded text-xs"
                      >
                        <option value="">—</option>
                        <option value="C">C</option>
                        <option value="PC">PC</option>
                        <option value="NC">NC</option>
                        <option value="Obs">Obs</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeQuestion(q.id)}
                        aria-label="Delete question"
                        className="p-1 rounded hover:bg-critical/10 text-charcoal-400 hover:text-critical"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addQuestion(section.id)}
            className="text-xs px-2 py-1 rounded border border-surface-300 hover:bg-surface-50"
          >
            + Add question
          </button>
          <button
            type="button"
            onClick={() => addSection(section.id)}
            className="text-xs px-2 py-1 rounded border border-surface-300 hover:bg-surface-50"
          >
            + Add sub-section
          </button>
        </div>

        {childSections.map((child) => renderSection(child, depth + 1))}
      </div>
    );
  }

  const unsectionedQuestions = questions.filter((q) => !q.sectionId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-charcoal-600">
          Reusable audit questionnaires. Select a template when scheduling an audit — questions are copied automatically.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" />
            New template
          </button>
        )}
      </div>

      {error && !editing && <div className="text-sm text-critical bg-critical/5 border border-critical/20 rounded-lg p-3">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-charcoal-500">
          <LoadingSpinner size={16} />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-dashed border-surface-300 rounded-xl p-6 text-sm text-charcoal-500">
          No audit checklist templates yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const count = Array.isArray(t.questions) ? t.questions.length : 0;
            return (
              <div key={t.id} className="border border-surface-200 rounded-xl p-4 bg-white shadow-card">
                <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                <p className="text-xs text-charcoal-500 mt-1">{count} question{count === 1 ? '' : 's'}</p>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(false)} />
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
              <div>
                <p className="text-sm font-semibold text-charcoal">New audit checklist template</p>
                <p className="text-xs text-charcoal-500 mt-0.5">Total score: {totalScore}</p>
              </div>
              <button type="button" onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-surface-100">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="text-sm text-critical bg-critical/5 border border-critical/20 rounded-lg p-3">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Template name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-charcoal">Sections</label>
                  <button
                    type="button"
                    onClick={() => addSection(null)}
                    className="text-xs px-2 py-1 rounded border border-teal text-teal hover:bg-teal/5"
                  >
                    + Add section
                  </button>
                </div>
                {topLevelSections.length === 0 && (
                  <p className="text-xs text-charcoal-500 mt-1">
                    Add a section (ISO clause + title), or skip straight to questions below.
                  </p>
                )}
                {topLevelSections.map((s) => renderSection(s, 0))}
              </div>

              <div className="border-t border-surface-200 pt-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-charcoal">Questions without a section</label>
                  <button
                    type="button"
                    onClick={() => addQuestion(null)}
                    className="text-xs px-2 py-1 rounded border border-surface-300 hover:bg-surface-50"
                  >
                    + Add question
                  </button>
                </div>
                {unsectionedQuestions.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-charcoal-500">
                          <th className="py-1 pr-2 text-left">Question</th>
                          <th className="py-1 pr-2 text-left">Evidence reviewed</th>
                          <th className="py-1 pr-2 text-left w-20">Score</th>
                          <th className="py-1 pr-2 text-left w-24">Compliance</th>
                          <th className="py-1 text-left w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {unsectionedQuestions.map((q) => (
                          <tr key={q.id} className="border-t border-surface-100 align-top">
                            <td className="py-1.5 pr-2">
                              <textarea
                                value={q.question}
                                onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                                placeholder="Question text *"
                                rows={2}
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <textarea
                                value={q.expectedEvidence}
                                onChange={(e) => updateQuestion(q.id, { expectedEvidence: e.target.value })}
                                placeholder="e.g. signed register"
                                rows={2}
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="number"
                                min={0}
                                value={q.allocatedScore}
                                onChange={(e) => updateQuestion(q.id, { allocatedScore: e.target.value })}
                                className="w-16 px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                value={q.complianceStatus}
                                onChange={(e) => updateQuestion(q.id, { complianceStatus: e.target.value as ComplianceOption | '' })}
                                className="w-full px-1.5 py-1 border border-surface-300 rounded text-xs"
                              >
                                <option value="">—</option>
                                <option value="C">C</option>
                                <option value="PC">PC</option>
                                <option value="NC">NC</option>
                                <option value="Obs">Obs</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </td>
                            <td className="py-1.5">
                              <button
                                type="button"
                                onClick={() => removeQuestion(q.id)}
                                aria-label="Delete question"
                                className="p-1 rounded hover:bg-critical/10 text-charcoal-400 hover:text-critical"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-white flex items-center justify-between gap-2 px-5 py-4 border-t border-surface-200">
              <p className="text-xs text-charcoal-500">Total score: {totalScore}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg border border-surface-300 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving && <LoadingSpinner size={14} />}
                  Save template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
