import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import type { UUID } from '../api/models/core';
import {
  createRiskAssessmentFromTemplate,
  deleteRiskAssessmentTemplate,
  listRiskAssessmentTemplates,
  listRiskAssessments,
  type MembershipScope,
  type RiskAssessment,
  type RiskAssessmentStatus,
  type RiskAssessmentTemplate,
  type RiskAssessmentType
} from '../api/services/riskAssessmentsService';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { LayersIcon, ShieldAlertIcon } from 'lucide-react';

function getScopeForActiveMembership(
  memberships: Array<{ company_id: UUID; site_id?: UUID | null; department_id?: UUID | null; consultant_scope?: any }> | undefined,
  companyId: UUID | null
): MembershipScope | null {
  if (!memberships || !companyId) return null;
  const active = memberships.find((m) => m.company_id === companyId);
  if (!active) return null;
  return {
    siteId: active.site_id ?? null,
    departmentId: active.department_id ?? null,
    consultantScope: active.consultant_scope ?? null
  };
}

const TYPE_LABEL: Record<RiskAssessmentType, string> = {
  baseline: 'Baseline',
  task: 'Task',
  critical: 'Critical Tasks',
  prework: 'Pre-Work'
};

const STATUS_LABEL: Record<RiskAssessmentStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  closed: 'Closed'
};

function StatusPill({ status }: { status: RiskAssessmentStatus }) {
  const cls = status === 'closed' ? 'bg-gray-200 text-gray-700' : status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function RisksPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const { user } = useUser();
  const [rows, setRows] = useState<RiskAssessment[]>([]);
  const [templates, setTemplates] = useState<RiskAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | RiskAssessmentType>('all');

  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  async function load() {
    if (!activeCompanyId || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [a, t] = await Promise.all([
        listRiskAssessments({
          companyId: activeCompanyId as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole,
          scope,
          limit: 500
        }),
        listRiskAssessmentTemplates({ companyId: activeCompanyId as UUID })
      ]);
      setRows(a);
      setTemplates(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risk assessments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [activeCompanyId, activeRole, user?.id]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [row.title, row.heading ?? '', row.area ?? '', row.activity ?? '', row.reference ?? ''].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, typeFilter]);

  async function onCreateFromTemplate(templateId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const created = await createRiskAssessmentFromTemplate({
        companyId: activeCompanyId as UUID,
        templateId,
        actorUserId: user.id as UUID,
        actorRole: activeRole
      });
      navigate(`/risk-assessments/${created.assessment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create from template');
    }
  }

  async function onDeleteTemplate(templateId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this risk assessment template? This cannot be undone.')) return;
    try {
      await deleteRiskAssessmentTemplate({
        companyId: activeCompanyId as UUID,
        templateId,
        actorUserId: user.id as UUID
      });
      setTemplates((current) => current.filter((template) => template.id !== templateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template');
    }
  }

  return (
    <Layout title="Risk Assessments">
      <div className="space-y-6">
        <div className="bg-white border border-surface-300 rounded-xl p-5 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Risk Assessments</h1>
              <p className="text-sm text-charcoal-500">Baseline, Task, Critical Tasks, and Pre-Work assessments.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button onClick={() => navigate('/risk-assessments/new?type=baseline')} className="px-3 py-2 rounded-lg bg-teal text-white text-sm">Create Baseline</button>
              <button onClick={() => navigate('/risk-assessments/new?type=task')} className="px-3 py-2 rounded-lg bg-teal text-white text-sm">Create Task</button>
              <button onClick={() => navigate('/risk-assessments/new?type=critical')} className="px-3 py-2 rounded-lg bg-teal text-white text-sm">Create Critical Tasks</button>
              <button onClick={() => navigate('/risk-assessments/new?type=prework')} className="px-3 py-2 rounded-lg bg-teal text-white text-sm">Create Pre-Work</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, area, activity, reference" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="all">All Types</option>
              <option value="baseline">Baseline</option>
              <option value="task">Task</option>
              <option value="critical">Critical Tasks</option>
              <option value="prework">Pre-Work</option>
            </select>
          </div>

          {error && <p className="text-sm text-critical mt-3">{error}</p>}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-hidden shadow-card">
          <div className="px-4 py-3 border-b border-surface-200 font-semibold text-charcoal">Assessments</div>
          {loading ? (
            <div className="p-4 space-y-2">
              <div className="h-10 bg-surface-100 rounded animate-pulse" />
              <div className="h-10 bg-surface-100 rounded animate-pulse" />
              <div className="h-10 bg-surface-100 rounded animate-pulse" />
            </div>
          ) : filtered.length === 0 ? (
            <ListEmptyState
              embedded
              icon={ShieldAlertIcon}
              title={rows.length === 0 ? 'No risk assessments yet' : 'No assessments match your filters'}
              description={
                rows.length === 0
                  ? 'Create baseline, task, critical, or pre-work assessments to document hazards and controls.'
                  : 'Try clearing search or setting the type filter to “All types”.'
              }
              primaryAction={{ kind: 'link', to: '/risk-assessments/new?type=baseline', label: 'Create baseline assessment' }}
              secondaryAction={
                rows.length > 0 && (search.trim() || typeFilter !== 'all')
                  ? {
                      kind: 'button',
                      label: 'Clear filters',
                      onClick: () => {
                        setSearch('');
                        setTypeFilter('all');
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Title</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Area / Activity</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Reference</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {filtered.map((row) => (
                    <tr key={row.id} onClick={() => navigate(`/risk-assessments/${row.id}`)} className="cursor-pointer hover:bg-surface-50">
                      <td className="px-4 py-2 text-sm font-medium text-charcoal">{row.title}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{TYPE_LABEL[row.type]}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{row.area || '-'} / {row.activity || '-'}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{row.reference || '-'}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{row.assessment_date || '-'}</td>
                      <td className="px-4 py-2"><StatusPill status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-charcoal">Template Library</h2>
            <span className="text-xs text-charcoal-500">Org scoped</span>
          </div>
          {templates.length === 0 ? (
            <ListEmptyState
              embedded
              icon={LayersIcon}
              title="No saved templates yet"
              description="Open any assessment, then save it as a template to reuse the structure for new assessments."
              primaryAction={{ kind: 'link', to: '/risk-assessments/new?type=baseline', label: 'Create assessment' }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="border border-surface-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                    <p className="text-xs text-charcoal-500">{TYPE_LABEL[t.type]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void onCreateFromTemplate(t.id)} className="px-3 py-1.5 rounded border border-teal text-teal text-xs font-semibold">Use Template</button>
                    <button onClick={() => void onDeleteTemplate(t.id)} className="px-3 py-1.5 rounded border border-critical text-critical text-xs font-semibold">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
