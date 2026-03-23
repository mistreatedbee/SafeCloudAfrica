import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import type { CompanyRole } from '../api/models/core';
import type { LegalComplianceStatus, LegalRequirement, UUID } from '../api/models/entities';
import {
  LEGAL_COMPLIANCE_OPTIONS,
  listLegalRequirements,
  renderLegalRegisterPdfHtml,
  runLegalUpdateReminderSweep,
  toLegalRequirementsCsv,
  updateLegalRequirement
} from '../api/services/legalRequirementsService';
import { listUserProfiles } from '../api/services/profilesService';
import { downloadTextFile } from '../utils/csv';
import { LegalRequirementCreateModal } from '../components/legal/LegalRequirementCreateModal';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { GavelIcon } from 'lucide-react';
import { useDraftManager } from '../session/DraftManagerProvider';

function canWrite(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'consultant';
}

function toDateOnly(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

export function LegalRegisterPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const navigate = useNavigate();
  const writable = canWrite(activeRole ?? null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [complianceStatus, setComplianceStatus] = useState<'' | LegalComplianceStatus>('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [applicability, setApplicability] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LegalRequirement | null>(null);

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);

  const { restoreLatestDraftByPrefix } = useDraftManager();

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    if (modalOpen) return;

    const draftKeyPrefix = `legal-requirement:${activeCompanyId}:`;
    const latest = restoreLatestDraftByPrefix<unknown>(draftKeyPrefix);
    if (!latest) return;

    // Ensure we only resume the draft for the current user.
    if (!latest.key.endsWith(`:${user.id}`)) return;

    const parts = latest.key.split(':');
    // legal-requirement:<companyId>:<editingIdPart>:<actorUserId>
    const editingIdPart = parts[2];
    if (!editingIdPart) return;

    if (editingIdPart === 'new') {
      setEditing(null);
      setModalOpen(true);
      return;
    }

    setEditing({ id: editingIdPart } as any);
    setModalOpen(true);
  }, [activeCompanyId, modalOpen, restoreLatestDraftByPrefix, user?.id]);

  const { data, loading, error, refetch } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      await runLegalUpdateReminderSweep(activeCompanyId).catch(() => undefined);
      return await listLegalRequirements({
        companyId: activeCompanyId,
        page,
        pageSize,
        search,
        complianceStatus: complianceStatus || undefined,
        responsibleUserId: (responsibleUserId || undefined) as UUID | undefined,
        applicability: applicability || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        updatedFrom: updatedFrom || undefined,
        updatedTo: updatedTo || undefined
      });
    },
    [
      activeCompanyId,
      page,
      pageSize,
      search,
      complianceStatus,
      responsibleUserId,
      applicability,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      refreshKey
    ]
  );

  const userLabelById = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.user_id, p.full_name || p.email || p.user_id));
    return map;
  }, [profiles]);

  const userOptions = useMemo(
    () =>
      (profiles ?? []).map((p) => ({
        userId: p.user_id,
        label: p.full_name || p.email || p.user_id
      })),
    [profiles]
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onExportCsv = () => {
    const csv = toLegalRequirementsCsv(rows, profiles ?? []);
    downloadTextFile(`legal-requirements-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const onExportPdf = () => {
    const html = renderLegalRegisterPdfHtml(rows, userLabelById);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const hasLegalRegisterFilters =
    Boolean(search.trim()) ||
    Boolean(complianceStatus) ||
    Boolean(responsibleUserId) ||
    Boolean(applicability.trim()) ||
    Boolean(createdFrom || createdTo || updatedFrom || updatedTo);

  function clearLegalRegisterFilters() {
    setSearch('');
    setComplianceStatus('');
    setResponsibleUserId('');
    setApplicability('');
    setCreatedFrom('');
    setCreatedTo('');
    setUpdatedFrom('');
    setUpdatedTo('');
    setPage(1);
  }

  return (
    <Layout title="Legal Requirements Register">
      {activeCompanyId && user?.id && (
        <LegalRequirementCreateModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          companyId={activeCompanyId}
          actorUserId={user.id as UUID}
          actorRole={activeRole ?? null}
          userOptions={userOptions}
          editing={editing}
          onSaved={async () => {
            setModalOpen(false);
            setEditing(null);
            setRefreshKey((k) => k + 1);
            await refetch();
          }}
        />
      )}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Requirement/Standard" className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[240px]" />
            <select value={complianceStatus} onChange={(e) => setComplianceStatus((e.target.value || '') as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All compliance status</option>
              {LEGAL_COMPLIANCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All responsible persons</option>
              {userOptions.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.label}
                </option>
              ))}
            </select>
            <input value={applicability} onChange={(e) => setApplicability(e.target.value)} placeholder="Applicability" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-charcoal-500">Created range</span>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <span className="text-xs text-charcoal-500 ml-2">Updated range</span>
            <input type="date" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!writable}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60"
            >
              Add Requirement
            </button>
            <button type="button" onClick={() => navigate('/dashboard/legal/updates')} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              View Updates History
            </button>
            <button type="button" onClick={onExportCsv} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export CSV
            </button>
            <button type="button" onClick={onExportPdf} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {error && <p className="p-4 text-sm text-critical">{error.message}</p>}
          {loading && <p className="p-4 text-sm text-charcoal-500">Loading legal requirements...</p>}
          {!loading && !error && (
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Requirement/Standard</th>
                  <th className="px-3 py-2 text-left">Reference (Sections)</th>
                  <th className="px-3 py-2 text-left">Applicability</th>
                  <th className="px-3 py-2 text-left">Compliance Status</th>
                  <th className="px-3 py-2 text-left">Responsible Person</th>
                  <th className="px-3 py-2 text-left">Last Updated</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((row) => {
                  const responsible = row.responsible_user_id
                    ? userLabelById.get(row.responsible_user_id) ?? row.responsible_user_id
                    : row.responsible_external_name || '-';
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">{row.requirement_standard}</td>
                      <td className="px-3 py-2">{(row.references ?? []).map((x) => x.referenceText).join(', ') || '-'}</td>
                      <td className="px-3 py-2">{row.applicability || '-'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={row.compliance_status}
                          disabled={!writable}
                          onChange={async (e) => {
                            if (!activeCompanyId || !user?.id) return;
                            await updateLegalRequirement({
                              companyId: activeCompanyId,
                              requirementId: row.id,
                              actorUserId: user.id as UUID,
                              actorRole: activeRole ?? null,
                              patch: { complianceStatus: e.target.value as LegalComplianceStatus }
                            });
                            setRefreshKey((k) => k + 1);
                          }}
                          className="px-2 py-1 rounded border border-surface-300 bg-white text-sm disabled:opacity-60"
                        >
                          {LEGAL_COMPLIANCE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">{responsible}</td>
                      <td className="px-3 py-2">{toDateOnly(row.updated_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => navigate(`/dashboard/legal/register/${row.id}`)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                            View/Edit
                          </button>
                          <button type="button" onClick={() => navigate(`/dashboard/legal/register/${row.id}?tab=updates`)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                            View Updates History
                          </button>
                          <button
                            type="button"
                            disabled={!writable}
                            onClick={() => {
                              setEditing(row);
                              setModalOpen(true);
                            }}
                            className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50 disabled:opacity-60"
                          >
                            Link Evidence
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <ListEmptyState
                    tableColSpan={7}
                    icon={GavelIcon}
                    title="No legal requirements match"
                    description="Build your register to link standards, evidence, owners, and compliance status."
                    primaryAction={
                      writable
                        ? {
                            kind: 'button',
                            label: 'Add requirement',
                            onClick: () => {
                              setEditing(null);
                              setModalOpen(true);
                            }
                          }
                        : { kind: 'link', to: '/modules/legal', label: 'Legal module' }
                    }
                    secondaryAction={
                      hasLegalRegisterFilters
                        ? { kind: 'button', label: 'Clear filters', onClick: clearLegalRegisterFilters }
                        : undefined
                    }
                  />
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-charcoal-500">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded border border-surface-300 text-sm disabled:opacity-50">
              Previous
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded border border-surface-300 text-sm disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
