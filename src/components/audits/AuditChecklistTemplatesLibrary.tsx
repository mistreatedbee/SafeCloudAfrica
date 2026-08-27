import { useEffect, useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import type { AuditChecklistTemplate, UUID } from '../../api/models/entities';
import { createAuditChecklistTemplate, listAuditChecklistTemplates } from '../../api/services/auditChecklistTemplatesService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useUser } from '@insforge/react';

type Props = {
  companyId: UUID;
  canManage: boolean;
};

function parseQuestionsInput(text: string): Array<{ question: string; section?: string; allocated_score?: number }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [section, question, score] = line.split('|').map((part) => part.trim());
      if (line.includes('|') && question) {
        return {
          section: section || undefined,
          question,
          allocated_score: score ? Number(score) || 1 : 1
        };
      }
      return { question: line, allocated_score: 1 };
    });
}

export function AuditChecklistTemplatesLibrary({ companyId, canManage }: Props) {
  const { user } = useUser();
  const [templates, setTemplates] = useState<AuditChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [questionsText, setQuestionsText] = useState('');
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

  async function saveTemplate() {
    if (!name.trim() || !user?.id) return;
    const questions = parseQuestionsInput(questionsText);
    if (questions.length === 0) {
      setError('Add at least one question (one per line).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAuditChecklistTemplate({
        companyId,
        name: name.trim(),
        questions,
        createdByUserId: user.id as UUID
      });
      setEditing(false);
      setName('');
      setQuestionsText('');
      await refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-charcoal-600">
          Reusable audit questionnaires. Select a template when scheduling an audit — questions are copied automatically.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" />
            New template
          </button>
        )}
      </div>

      {error && <div className="text-sm text-critical bg-critical/5 border border-critical/20 rounded-lg p-3">{error}</div>}

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
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-surface-200">
              <p className="text-sm font-semibold text-charcoal">New audit checklist template</p>
              <button type="button" onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-surface-100">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Template name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Questions *</label>
                <p className="text-xs text-charcoal-500 mb-2">One per line. Optional format: Section | Question | Score</p>
                <textarea
                  value={questionsText}
                  onChange={(e) => setQuestionsText(e.target.value)}
                  rows={10}
                  placeholder={'Safety | Are emergency exits clear? | 2\nQuality | Is the procedure available on site? | 1'}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-surface-200">
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
      )}
    </div>
  );
}
