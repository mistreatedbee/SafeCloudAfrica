import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import type { ImprovementRecord, ImprovementSourceType, ImprovementType, ImprovementWorkflowStatus, UUID } from '../api/models/entities';
import {
  deleteImprovement,
  getImprovementSummary,
  IMPROVEMENT_SOURCE_LABELS,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_TYPE_LABELS,
  isImprovementOverdue,
  listImprovements,
  runImprovementReminderSweep,
  updateImprovementStatus
} from '../api/services/improvementService';
import { listUserProfiles } from '../api/services/profilesService';
import { toCsv, downloadTextFile } from '../utils/csv';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { ClipboardListIcon } from 'lucide-react';
import { toUserFacingError } from '../utils/userFacingMessage';

type DateRange = {
  from: string;
  to: string;
};

function roleCanEdit(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

function roleCanClose(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-ZA');
}

function shortDescription(text: string | null): string {
  if (!text) return '-';
  const line = text.split('\n')[0].trim();
  return line.length > 80 ? `${line.slice(0, 80)}...` : line;
}

const STATUS_OPTIONS: ImprovementWorkflowStatus[] = [
  'open',
  'in_progress',
  'awaiting_evidence',
  'awaiting_verification',
  'under_management_review',
  'closed',
  'monitoring_required',
  'escalated'
];

export function ImprovementPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const navigate = useNavigate();
  const canEdit = roleCanEdit(activeRole ?? null);
  const canClose = roleCanClose(activeRole ?? null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | ImprovementWorkflowStatus>('');
  const [typeFilter, setTypeFilter] = useState<'' | ImprovementType>('');
  const [riskFilter, setRiskFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | ImprovementSourceType>('');
  const [raisedByFilter, setRaisedByFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateRaised, setDateRaised] = useState<DateRange>({ from: '', to: '' });
  const [dateTarget, setDateTarget] = useState<DateRange>({ from: '', to: '' });
  const [dateClosure, setDateClosure] = useState<DateRange>({ from: '', to: '' });

  const { data: profiles } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: summary, refetch: refreshSummary } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getImprovementSummary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const { data: records, loading, error, refetch: refresh } = useAsync<ImprovementRecord[]>(
    async () => {
      if (!activeCompanyId) return [];
      const list = await listImprovements({
        companyId: activeCompanyId,
        search,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        riskLevel: (riskFilter || undefined) as any,
        departmentSite: deptFilter || undefined,
        sourceType: sourceFilter || undefined,
        raisedByUserId: (raisedByFilter || undefined) as UUID | undefined,
        responsibleUserId: (responsibleFilter || undefined) as UUID | undefined,
        dateRaisedFrom: dateRaised.from || undefined,
        dateRaisedTo: dateRaised.to || undefined,
        targetDateFrom: dateTarget.from || undefined,
        targetDateTo: dateTarget.to || undefined,
        closureDateFrom: dateClosure.from || undefined,
        closureDateTo: dateClosure.to || undefined
      });
      if (activeRole === 'employee' && user?.id) {
        return list.filter((r) => r.raised_by_user_id === user.id);
      }
      return list;
    },
    [
      activeCompanyId,
      activeRole,
      dateClosure.from,
      dateClosure.to,
      dateRaised.from,
      dateRaised.to,
      dateTarget.from,
      dateTarget.to,
      deptFilter,
      raisedByFilter,
      refreshKey,
      responsibleFilter,
      riskFilter,
      search,
      sourceFilter,
      statusFilter,
      typeFilter,
      user?.id
    ]
  );

  useEffect(() => {
    if (!activeCompanyId) return;
    void runImprovementReminderSweep(activeCompanyId).catch(() => undefined);
  }, [activeCompanyId, refreshKey]);

  const profileNameByUser = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((profile) => {
      map.set(profile.user_id, profile.full_name || profile.email || profile.user_id.slice(0, 8));
    });
    return map;
  }, [profiles]);

  const uniqueDepartments = useMemo(() => {
    const values = new Set<string>();
    (records ?? []).forEach((row) => {
      if (row.department_site?.trim()) values.add(row.department_site.trim());
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const uniqueUsers = useMemo(() => {
    const ids = new Set<string>();
    (records ?? []).forEach((row) => {
      if (row.raised_by_user_id) ids.add(row.raised_by_user_id);
      if (row.responsible_user_id) ids.add(row.responsible_user_id);
    });
    return [...ids];
  }, [records]);

  async function onChangeStatus(rec: ImprovementRecord, nextStatus: ImprovementWorkflowStatus) {
    if (!activeCompanyId || !user?.id) return;
    if (!canEdit) return;
    if ((nextStatus === 'closed' || nextStatus === 'monitoring_required') && !canClose) return;
    const comment = prompt('Optional status update comment:') ?? '';
    try {
      await updateImprovementStatus({
        companyId: activeCompanyId,
        improvementId: rec.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        status: nextStatus,
        comment: comment.trim() || undefined
      });
      setRefreshKey((v) => v + 1);
      await refresh();
      await refreshSummary();
    } catch (err) {
      alert(toUserFacingError(err, 'Unable to update improvement status.'));
    }
  }

  async function onAddComment(rec: ImprovementRecord) {
    const text = prompt('Add comment');
    if (!text?.trim()) return;
    navigate(`/improvement/${rec.id}?comment=${encodeURIComponent(text.trim())}`);
  }

  async function onDelete(rec: ImprovementRecord) {
    if (!activeCompanyId || !user?.id || !canEdit) return;
    const confirmed = window.confirm(`Delete improvement ${rec.reference_number}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteImprovement({
        companyId: activeCompanyId,
        improvementId: rec.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null
      });
      setRefreshKey((v) => v + 1);
      await refresh();
      await refreshSummary();
    } catch (err) {
      alert(toUserFacingError(err, 'Unable to delete improvement record.'));
    }
  }

  const hasImprovementFilters =
    Boolean(statusFilter) ||
    Boolean(typeFilter) ||
    Boolean(riskFilter) ||
    Boolean(deptFilter) ||
    Boolean(sourceFilter) ||
    Boolean(raisedByFilter) ||
    Boolean(responsibleFilter) ||
    Boolean(search.trim()) ||
    Boolean(dateRaised.from || dateRaised.to) ||
    Boolean(dateTarget.from || dateTarget.to) ||
    Boolean(dateClosure.from || dateClosure.to);

  function clearImprovementFilters() {
    setStatusFilter('');
    setTypeFilter('');
    setRiskFilter('');
    setDeptFilter('');
    setSourceFilter('');
    setRaisedByFilter('');
    setResponsibleFilter('');
    setSearch('');
    setDateRaised({ from: '', to: '' });
    setDateTarget({ from: '', to: '' });
    setDateClosure({ from: '', to: '' });
  }

  function exportCsv() {
    const rows = (records ?? []).map((r) => ({
      reference_number: r.reference_number,
      type: IMPROVEMENT_TYPE_LABELS[r.improvement_type],
      description: shortDescription(r.description),
      risk_level: r.risk_level,
      department_site: r.department_site ?? '',
      raised_by: profileNameByUser.get(r.raised_by_user_id) ?? r.raised_by_user_id,
      responsible_person: r.responsible_user_id ? profileNameByUser.get(r.responsible_user_id) ?? r.responsible_user_id : '',
      target_date: r.target_date ?? '',
      status: IMPROVEMENT_STATUS_LABELS[r.status],
      date_raised: r.date_raised,
      closure_date: r.closure_date ?? '',
      last_updated: r.updated_at,
      source_module: IMPROVEMENT_SOURCE_LABELS[r.source_type]
    }));
    const csv = toCsv(rows);
    downloadTextFile(`improvements-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    const html = `
      <html><head><title>Improvement Register</title></head><body>
      <h2>Improvement Register</h2>
      <table border="1" cellspacing="0" cellpadding="6">
        <thead><tr>
          <th>Reference</th><th>Type</th><th>Description</th><th>Risk</th><th>Department/Site</th><th>Status</th><th>Target</th>
        </tr></thead>
        <tbody>
          ${(records ?? [])
            .map(
              (r) =>
                `<tr><td>${r.reference_number}</td><td>${IMPROVEMENT_TYPE_LABELS[r.improvement_type]}</td><td>${shortDescription(
                  r.description
                )}</td><td>${r.risk_level}</td><td>${r.department_site ?? ''}</td><td>${IMPROVEMENT_STATUS_LABELS[r.status]}</td><td>${
                  r.target_date ?? ''
                }</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
      </body></html>
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.print();
  }

  return (
    <Layout title="Improvement Register">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Open</p>
            <p className="text-xl font-semibold text-charcoal">{summary?.openCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Overdue</p>
            <p className="text-xl font-semibold text-critical">{summary?.overdueCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">High/Critical Open</p>
            <p className="text-xl font-semibold text-warning">{summary?.highCriticalOpenCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Closed (This Month)</p>
            <p className="text-xl font-semibold text-success">{summary?.closedThisMonthCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Monitoring Required</p>
            <p className="text-xl font-semibold text-charcoal">{summary?.monitoringRequiredCount ?? 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference/description/department"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[260px]"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || '') as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {IMPROVEMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter((e.target.value || '') as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All types</option>
              {(Object.keys(IMPROVEMENT_TYPE_LABELS) as ImprovementType[]).map((t) => (
                <option key={t} value={t}>
                  {IMPROVEMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All risk levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All departments/sites</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter((e.target.value || '') as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All sources</option>
              {(Object.keys(IMPROVEMENT_SOURCE_LABELS) as ImprovementSourceType[]).map((source) => (
                <option key={source} value={source}>
                  {IMPROVEMENT_SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={raisedByFilter} onChange={(e) => setRaisedByFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All raised-by users</option>
              {uniqueUsers.map((id) => (
                <option key={`raised-${id}`} value={id}>
                  {profileNameByUser.get(id) ?? id.slice(0, 8)}
                </option>
              ))}
            </select>
            <select value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All responsible users</option>
              {uniqueUsers.map((id) => (
                <option key={`owner-${id}`} value={id}>
                  {profileNameByUser.get(id) ?? id.slice(0, 8)}
                </option>
              ))}
            </select>
            <span className="text-xs text-charcoal-500 ml-2">Date Raised</span>
            <input type="date" value={dateRaised.from} onChange={(e) => setDateRaised((v) => ({ ...v, from: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateRaised.to} onChange={(e) => setDateRaised((v) => ({ ...v, to: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <span className="text-xs text-charcoal-500 ml-2">Target</span>
            <input type="date" value={dateTarget.from} onChange={(e) => setDateTarget((v) => ({ ...v, from: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateTarget.to} onChange={(e) => setDateTarget((v) => ({ ...v, to: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <span className="text-xs text-charcoal-500 ml-2">Closure</span>
            <input type="date" value={dateClosure.from} onChange={(e) => setDateClosure((v) => ({ ...v, from: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateClosure.to} onChange={(e) => setDateClosure((v) => ({ ...v, to: e.target.value }))} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/improvement/new')} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold hover:bg-success-600">
              Create Improvement
            </button>
            <button type="button" onClick={exportCsv} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export CSV
            </button>
            <button type="button" onClick={exportPdf} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {error && <p className="p-4 text-sm text-critical">{error.message}</p>}
          {loading && <p className="p-4 text-sm text-charcoal-500">Loading improvements...</p>}
          {!loading && !error && (
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Reference Number</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Title / Short Description</th>
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className="px-3 py-2 text-left">Department/Site</th>
                  <th className="px-3 py-2 text-left">Raised By</th>
                  <th className="px-3 py-2 text-left">Responsible Person</th>
                  <th className="px-3 py-2 text-left">Target Date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Date Raised</th>
                  <th className="px-3 py-2 text-left">Last Updated</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(records ?? []).map((row) => {
                  const overdue = isImprovementOverdue(row);
                  const raisedByName = profileNameByUser.get(row.raised_by_user_id) ?? row.raised_by_user_id.slice(0, 8);
                  const responsibleName = row.responsible_user_id
                    ? profileNameByUser.get(row.responsible_user_id) ?? row.responsible_user_id.slice(0, 8)
                    : '-';

                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-2 font-semibold text-teal">{row.reference_number}</td>
                      <td className="px-3 py-2">{IMPROVEMENT_TYPE_LABELS[row.improvement_type]}</td>
                      <td className="px-3 py-2">{shortDescription(row.description)}</td>
                      <td className="px-3 py-2 capitalize">{row.risk_level}</td>
                      <td className="px-3 py-2">{row.department_site || '-'}</td>
                      <td className="px-3 py-2">{raisedByName}</td>
                      <td className="px-3 py-2">{responsibleName}</td>
                      <td className="px-3 py-2">{formatDate(row.target_date)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex px-2 py-1 rounded bg-surface-100 text-xs font-semibold">{IMPROVEMENT_STATUS_LABELS[row.status]}</span>
                        {overdue && <span className="ml-2 inline-flex px-2 py-1 rounded bg-critical/10 text-critical text-xs font-semibold">Overdue</span>}
                      </td>
                      <td className="px-3 py-2">{formatDate(row.date_raised)}</td>
                      <td className="px-3 py-2">{formatDate(row.updated_at)}</td>
                      <td className="px-3 py-2">{IMPROVEMENT_SOURCE_LABELS[row.source_type]}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => navigate(`/improvement/${row.id}`)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                            View
                          </button>
                          {canEdit && (
                            <button type="button" onClick={() => navigate(`/improvement/${row.id}`)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                              Edit
                            </button>
                          )}
                          {canEdit && (
                            <select
                              value={row.status}
                              onChange={(e) => void onChangeStatus(row, e.target.value as ImprovementWorkflowStatus)}
                              className="px-2 py-1 rounded border border-surface-300 text-xs"
                            >
                              {STATUS_OPTIONS.map((statusValue) => (
                                <option
                                  key={statusValue}
                                  value={statusValue}
                                  disabled={!canClose && (statusValue === 'closed' || statusValue === 'monitoring_required')}
                                >
                                  {IMPROVEMENT_STATUS_LABELS[statusValue]}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="button" onClick={() => onAddComment(row)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                            Add Comment
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => void onDelete(row)}
                              className="px-2 py-1 rounded border border-critical/30 text-critical text-xs hover:bg-critical/5"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(records ?? []).length === 0 && (
                  <ListEmptyState
                    tableColSpan={13}
                    icon={ClipboardListIcon}
                    title="No improvement records match"
                    description="Create a corrective action or improvement, or widen your filters to see more rows."
                    primaryAction={{ kind: 'link', to: '/improvement/new', label: 'New improvement / CAPA' }}
                    secondaryAction={
                      hasImprovementFilters
                        ? { kind: 'button', label: 'Clear filters', onClick: clearImprovementFilters }
                        : undefined
                    }
                  />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
