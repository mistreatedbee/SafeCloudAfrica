import { useState } from 'react';
import { SparklesIcon, CheckCircleIcon, FileTextIcon, Loader2Icon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/ToastProvider';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { AiDocType, AiGeneratedDocument } from '../../api/models/entities';
import {
  generateAiDocument,
  listAiGeneratedDocuments,
  updateAiGeneratedDocument,
  type AiGeneratedDocumentContent
} from '../../api/services/aiDocumentGeneratorService';

const DOC_TYPE_OPTIONS: Array<{ value: AiDocType; label: string; example: string }> = [
  { value: 'hira', label: 'Risk Assessment (HIRA)', example: 'Installing underground fibre cables next to a live road' },
  { value: 'jsa', label: 'Job Safety Analysis (JSA)', example: 'Replacing a hydraulic pump on a stationary generator' },
  { value: 'sop', label: 'Standard Operating Procedure', example: 'Operating a forklift in a warehouse aisle' },
  { value: 'swp', label: 'Safe Work Procedure', example: 'Working at heights on a scaffold above 3 metres' },
  { value: 'toolbox_talk', label: 'Toolbox Talk', example: 'Excavation work near underground services this week' },
  { value: 'permit', label: 'Permit to Work', example: 'Confined space entry into a disused fuel tank' },
  { value: 'emergency_plan', label: 'Emergency Response Plan', example: 'Fire evacuation for a two-storey warehouse' },
  { value: 'method_statement', label: 'Method Statement', example: 'Demolition of an internal masonry wall' },
  { value: 'policy', label: 'Policy', example: 'Company alcohol and substance abuse policy' },
  { value: 'environmental_plan', label: 'Environmental Plan', example: 'Spill prevention plan for a diesel storage area' },
  { value: 'checklist', label: 'Checklist', example: 'Monthly fire extinguisher inspection checklist' },
  { value: 'inspection_form', label: 'Inspection Form', example: 'Daily vehicle pre-use inspection form' }
];

const RISK_BADGE: Record<string, string> = {
  Low: 'bg-success/10 text-success border-success/30',
  Medium: 'bg-warning/15 text-charcoal border-warning/30',
  High: 'bg-critical/10 text-critical border-critical/30',
  Critical: 'bg-critical text-white border-critical'
};

const canApproveRoles = new Set(['owner', 'admin', 'manager', 'supervisor']);

export function AiSafetyAssistantPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const { showSuccess, showError } = useToast();

  const [docType, setDocType] = useState<AiDocType>('hira');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [active, setActive] = useState<AiGeneratedDocument | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const canApprove = activeRole ? canApproveRoles.has(activeRole) : false;

  const { data: recent, loading: recentLoading } = useAsync<AiGeneratedDocument[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listAiGeneratedDocuments({ companyId: activeCompanyId, limit: 20 });
    },
    [activeCompanyId, refreshKey]
  );

  async function handleGenerate() {
    if (!activeCompanyId || !user?.id || !prompt.trim()) return;
    setGenerating(true);
    try {
      const doc = await generateAiDocument({
        companyId: activeCompanyId,
        createdByUserId: user.id,
        docType,
        prompt: prompt.trim()
      });
      setActive(doc);
      setRefreshKey((k) => k + 1);
      showSuccess(`${DOC_TYPE_OPTIONS.find((o) => o.value === docType)?.label ?? 'Document'} drafted. Review and approve below.`);
    } catch (err) {
      showError(toUserFacingError(err, 'Could not generate the document. Please try again.'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!active || !activeCompanyId || !user?.id) return;
    setSavingStatus(true);
    try {
      const updated = await updateAiGeneratedDocument(active.id, activeCompanyId, { status: 'approved' }, user.id);
      setActive(updated);
      setRefreshKey((k) => k + 1);
      showSuccess('Document approved.');
    } catch (err) {
      showError(toUserFacingError(err, 'Could not approve the document.'));
    } finally {
      setSavingStatus(false);
    }
  }

  const content = active?.content as AiGeneratedDocumentContent | undefined;
  const selectedExample = DOC_TYPE_OPTIONS.find((o) => o.value === docType)?.example ?? '';

  return (
    <Layout title="AI Safety Assistant">
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <SparklesIcon className="w-5 h-5 text-teal" />
            <h1 className="text-lg font-semibold text-charcoal">Describe the work. Get a draft in seconds.</h1>
          </div>
          <p className="text-sm text-charcoal-500 mb-4">
            The assistant drafts from your description plus related records already in this company's history — every draft cites what it used and needs sign-off before it's final.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as AiDocType)}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              {DOC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`e.g. ${selectedExample}`}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !generating) void handleGenerate();
              }}
            />
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              disabled={generating || !prompt.trim() || !activeCompanyId}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
              {generating ? 'Drafting...' : 'Generate draft'}
            </button>
          </div>
        </div>

        {active && content && (
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-charcoal">{content.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    active.status === 'draft' ? 'bg-warning/15 text-charcoal border-warning/30' : 'bg-success/10 text-success border-success/30'
                  }`}>
                    {active.status === 'draft' ? 'AI-drafted · needs review' : active.status}
                  </span>
                </div>
                <p className="text-sm text-charcoal-500 mt-1">{content.summary}</p>
              </div>
              {active.status === 'draft' && canApprove && (
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-success text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 shrink-0"
                >
                  {savingStatus ? <LoadingSpinner size={16} /> : <CheckCircleIcon className="w-4 h-4" />}
                  Approve
                </button>
              )}
            </div>

            <div className="space-y-3">
              {content.sections?.map((section, idx) => (
                <div key={idx} className="border-t border-surface-200 pt-3">
                  <h3 className="text-sm font-semibold text-charcoal">{section.heading}</h3>
                  <p className="text-sm text-charcoal-600 mt-1 whitespace-pre-wrap">{section.body}</p>
                </div>
              ))}
            </div>

            {content.hazards && content.hazards.length > 0 && (
              <div className="border-t border-surface-200 pt-3">
                <h3 className="text-sm font-semibold text-charcoal mb-2">Hazards &amp; controls</h3>
                <div className="space-y-2">
                  {content.hazards.map((hazard, idx) => (
                    <div key={idx} className="border border-surface-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-charcoal">{hazard.hazard}</p>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${RISK_BADGE[hazard.risk_rating] ?? ''}`}>
                          {hazard.risk_rating}
                        </span>
                      </div>
                      {hazard.controls?.length > 0 && (
                        <p className="text-xs text-charcoal-500 mt-1"><b>Controls:</b> {hazard.controls.join('; ')}</p>
                      )}
                      {hazard.ppe?.length > 0 && (
                        <p className="text-xs text-charcoal-500 mt-1"><b>PPE:</b> {hazard.ppe.join(', ')}</p>
                      )}
                      {hazard.legislation?.length > 0 && (
                        <p className="text-xs text-charcoal-500 mt-1"><b>Legislation:</b> {hazard.legislation.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
                {content.review_schedule && (
                  <p className="text-xs text-charcoal-500 mt-2">Review schedule: {content.review_schedule}</p>
                )}
              </div>
            )}

            {active.cited_sources && active.cited_sources.length > 0 && (
              <div className="border-t border-surface-200 pt-3">
                <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide mb-1">Grounded in</p>
                <ul className="text-xs text-charcoal-500 space-y-0.5">
                  {active.cited_sources.map((source, idx) => (
                    <li key={idx}>{source.label} ({Math.round((source.similarity ?? 0) * 100)}% match)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-300 shadow-card">
          <div className="px-5 py-3 border-b border-surface-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-charcoal">Recent drafts</h3>
            {recentLoading && <LoadingSpinner size={14} />}
          </div>
          <div className="divide-y divide-surface-100">
            {!recentLoading && (recent ?? []).length === 0 && (
              <p className="px-5 py-6 text-sm text-charcoal-500 text-center">No documents generated yet. Try the form above.</p>
            )}
            {(recent ?? []).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setActive(doc)}
                className="w-full text-left px-5 py-3 hover:bg-surface-50 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-charcoal-400 shrink-0" />
                  <span className="text-sm text-charcoal truncate">{doc.title}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                  doc.status === 'draft' ? 'bg-warning/15 text-charcoal border-warning/30' : 'bg-success/10 text-success border-success/30'
                }`}>
                  {doc.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
