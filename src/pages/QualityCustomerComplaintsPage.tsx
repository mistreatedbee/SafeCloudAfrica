import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { CompanyRole, UUID } from '../api/models/core';
import type { CustomerComplaintStatus, QualityCustomerComplaint } from '../api/models/entities';
import {
  CUSTOMER_COMPLAINT_STATUS_LABELS,
  createCustomerComplaint,
  getCustomerComplaintSummary,
  listComplaintHandlers,
  listCustomerComplaints,
  updateCustomerComplaint
} from '../api/services/customerComplaintsService';
import { downloadTextFile, toCsv } from '../utils/csv';
import { EvidenceModal } from '../components/evidence/EvidenceModal';

type FormMode = 'create' | 'edit' | 'view';

type ComplaintFormState = {
  id?: UUID;
  complaintRefNo: string;
  customerName: string;
  personHandlingUserId: UUID | '';
  personHandlingNameSnapshot: string;
  dateReceived: string;
  description: string;
  actionTaken: string;
  status: CustomerComplaintStatus;
  customerFeedback: string;
  createLinkedNcr: boolean;
  createLinkedTask: boolean;
  linkedTaskAssigneeUserId: UUID | '';
};

const STATUS_OPTIONS: CustomerComplaintStatus[] = ['CLOSED', 'MONITORING_REQUIRED', 'ESCALATED_TO_MANAGEMENT'];

function addMonths(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-ZA');
}

function roleCanWrite(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'employee';
}

function roleCanEdit(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

function roleCanCloseEscalate(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager';
}

function roleCanEditRef(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

function toForm(row?: QualityCustomerComplaint): ComplaintFormState {
  return {
    id: row?.id,
    complaintRefNo: row?.complaint_ref_no ?? '',
    customerName: row?.customer_name ?? '',
    personHandlingUserId: (row?.person_handling_user_id as UUID | null) ?? '',
    personHandlingNameSnapshot: row?.person_handling_name_snapshot ?? '',
    dateReceived: row?.date_received?.slice(0, 10) ?? dateOnly(new Date()),
    description: row?.description ?? '',
    actionTaken: row?.action_taken ?? '',
    status: row?.status ?? 'MONITORING_REQUIRED',
    customerFeedback: row?.customer_feedback ?? '',
    createLinkedNcr: false,
    createLinkedTask: false,
    linkedTaskAssigneeUserId: (row?.person_handling_user_id as UUID | null) ?? ''
  };
}

export default function QualityCustomerComplaintsPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const now = new Date();
  const [dateFrom, setDateFrom] = useState<string>(dateOnly(addMonths(now, -3)));
  const [dateTo, setDateTo] = useState<string>(dateOnly(now));
  const [statusFilter, setStatusFilter] = useState<'' | CustomerComplaintStatus>('');
  const [personHandlingFilter, setPersonHandlingFilter] = useState<UUID | ''>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [refSearch, setRefSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<ComplaintFormState>(toForm());
  const [attachmentComplaint, setAttachmentComplaint] = useState<QualityCustomerComplaint | null>(null);

  const canWrite = roleCanWrite(activeRole ?? null);
  const canEdit = roleCanEdit(activeRole ?? null);
  const canCloseEscalate = roleCanCloseEscalate(activeRole ?? null);
  const canEditRef = roleCanEditRef(activeRole ?? null);
  const readOnly = formMode === 'view' || (formMode === 'edit' && !canEdit);

  const { data: complaints, loading, error, refresh } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    return await listCustomerComplaints({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID,
      status: statusFilter || undefined,
      dateFrom,
      dateTo,
      personHandlingUserId: personHandlingFilter || undefined,
      customerSearch: customerSearch || undefined,
      complaintRefSearch: refSearch || undefined
    });
  }, [activeCompanyId, activeRole, customerSearch, dateFrom, dateTo, personHandlingFilter, refSearch, refreshKey, statusFilter, user?.id]);

  const { data: summary } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return await getCustomerComplaintSummary({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID,
      dateFrom,
      dateTo
    });
  }, [activeCompanyId, activeRole, dateFrom, dateTo, refreshKey, user?.id]);

  const { data: handlers } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listComplaintHandlers(activeCompanyId);
  }, [activeCompanyId]);

  const handlerOptions = useMemo(
    () =>
      [...(handlers ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((handler) => ({
        value: handler.userId,
        label: `${handler.displayName} (${handler.role})`
      })),
    [handlers]
  );

  async function reload() {
    setRefreshKey((v) => v + 1);
    await refresh();
  }

  function openCreate() {
    setFormMode('create');
    setForm(toForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openView(row: QualityCustomerComplaint) {
    setFormMode('view');
    setForm(toForm(row));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: QualityCustomerComplaint) {
    setFormMode('edit');
    setForm(toForm(row));
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!activeCompanyId || !user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        companyId: activeCompanyId,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        complaintRefNo: canEditRef ? form.complaintRefNo.trim() || undefined : undefined,
        customerName: form.customerName.trim(),
        personHandlingUserId: form.personHandlingUserId || null,
        personHandlingNameSnapshot: form.personHandlingNameSnapshot.trim(),
        dateReceived: form.dateReceived,
        description: form.description.trim(),
        actionTaken: form.actionTaken.trim() || null,
        status: form.status,
        customerFeedback: form.customerFeedback.trim() || null
      };

      if (formMode === 'create') {
        await createCustomerComplaint({
          ...payload,
          createLinkedNcr: form.createLinkedNcr,
          createLinkedTask: form.createLinkedTask,
          linkedTaskAssigneeUserId: form.linkedTaskAssigneeUserId || undefined
        });
      } else if (form.id) {
        await updateCustomerComplaint({
          companyId: activeCompanyId,
          complaintId: form.id,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          patch: {
            complaint_ref_no: canEditRef ? form.complaintRefNo.trim() : undefined,
            customer_name: form.customerName.trim(),
            person_handling_user_id: form.personHandlingUserId || null,
            person_handling_name_snapshot: form.personHandlingNameSnapshot.trim(),
            date_received: form.dateReceived,
            description: form.description.trim(),
            action_taken: form.actionTaken.trim() || null,
            status: form.status,
            customer_feedback: form.customerFeedback.trim() || null
          }
        });
      }

      setModalOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save complaint.');
    } finally {
      setSaving(false);
    }
  }

  async function quickSetStatus(row: QualityCustomerComplaint, nextStatus: CustomerComplaintStatus) {
    if (!activeCompanyId || !user?.id) return;
    if ((nextStatus === 'CLOSED' || nextStatus === 'ESCALATED_TO_MANAGEMENT') && !canCloseEscalate) {
      alert('Only owner/admin/manager can close or escalate complaints.');
      return;
    }
    try {
      await updateCustomerComplaint({
        companyId: activeCompanyId,
        complaintId: row.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        patch: { status: nextStatus }
      });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  function exportRows(rows: QualityCustomerComplaint[], filenamePrefix = 'customer-complaints') {
    const csvRows = rows.map((row) => ({
      'Complaint Ref. No#': row.complaint_ref_no,
      'Customer Name': row.customer_name,
      'Person Handling Complaint': row.person_handling_name_snapshot,
      'Date Received': row.date_received,
      Description: row.description,
      'Action taken': row.action_taken ?? '',
      Status: CUSTOMER_COMPLAINT_STATUS_LABELS[row.status],
      'Customer feedback': row.customer_feedback ?? '',
      'Linked NCR ID': row.linked_ncr_id ?? '',
      'Linked Task ID': row.linked_task_id ?? '',
      'Created At': row.created_at
    }));
    const csv = toCsv(csvRows);
    downloadTextFile(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Customer Complaints">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Total complaints</p>
            <p className="text-2xl font-semibold text-charcoal">{summary?.total ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Open/Active</p>
            <p className="text-2xl font-semibold text-warning">{summary?.openActive ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Closed</p>
            <p className="text-2xl font-semibold text-success">{summary?.closed ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-3">
            <p className="text-xs text-charcoal-500">Escalated to Management</p>
            <p className="text-2xl font-semibold text-critical">{summary?.escalated ?? 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-charcoal-500">Date range</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || '') as '' | CustomerComplaintStatus)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {CUSTOMER_COMPLAINT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              value={personHandlingFilter}
              onChange={(e) => setPersonHandlingFilter((e.target.value || '') as UUID | '')}
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[220px]"
            >
              <option value="">All handlers</option>
              {handlerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Customer name search"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[200px]"
            />
            <input
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              placeholder="Complaint ref search"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[200px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <button type="button" onClick={openCreate} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">
                New Complaint
              </button>
            )}
            <button type="button" onClick={() => exportRows(complaints ?? [])} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export CSV
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {error && <p className="p-4 text-sm text-critical">{error.message}</p>}
          {loading && <p className="p-4 text-sm text-charcoal-500">Loading complaints...</p>}
          {!loading && !error && (
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Complaint Ref. No#</th>
                  <th className="px-3 py-2 text-left">Customer Name</th>
                  <th className="px-3 py-2 text-left">Person Handling Complaint</th>
                  <th className="px-3 py-2 text-left">Date Received</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Action taken</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Customer feedback</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(complaints ?? []).map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 font-semibold text-teal">{row.complaint_ref_no}</td>
                    <td className="px-3 py-2">{row.customer_name}</td>
                    <td className="px-3 py-2">{row.person_handling_name_snapshot}</td>
                    <td className="px-3 py-2">{formatDate(row.date_received)}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2">{row.action_taken || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-1 rounded bg-surface-100 text-xs font-semibold">
                        {CUSTOMER_COMPLAINT_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.customer_feedback || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openView(row)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                          View
                        </button>
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(row)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">
                            Edit
                          </button>
                        )}
                        {(canEdit || canCloseEscalate) && (
                          <select
                            value={row.status}
                            onChange={(e) => void quickSetStatus(row, e.target.value as CustomerComplaintStatus)}
                            className="px-2 py-1 rounded border border-surface-300 text-xs"
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {CUSTOMER_COMPLAINT_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => exportRows([row], `customer-complaint-${row.complaint_ref_no}`)}
                          className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50"
                        >
                          Export
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(complaints ?? []).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-charcoal-500">
                      No complaints found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-4xl bg-white rounded-2xl border border-surface-300 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-charcoal">
                {formMode === 'create' ? 'Create Complaint' : formMode === 'edit' ? 'Edit Complaint' : 'Complaint Details'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1.5 rounded border border-surface-300 text-sm">
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
                  <p className="text-sm text-critical">{formError}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Complaint Ref. No#</label>
                  <input
                    value={form.complaintRefNo}
                    disabled={!canEditRef || formMode === 'view'}
                    onChange={(e) => setForm((s) => ({ ...s, complaintRefNo: e.target.value }))}
                    placeholder="Auto-generated (CCL-YYYY-0001)"
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Customer Name</label>
                  <input
                    value={form.customerName}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Person Handling Complaint</label>
                  <select
                    value={form.personHandlingUserId}
                    disabled={readOnly}
                    onChange={(e) => {
                      const nextUserId = (e.target.value || '') as UUID | '';
                      if (nextUserId) {
                        const selected = handlers?.find((x) => x.userId === nextUserId);
                        setForm((s) => ({
                          ...s,
                          personHandlingUserId: nextUserId,
                          personHandlingNameSnapshot: selected?.displayName ?? s.personHandlingNameSnapshot,
                          linkedTaskAssigneeUserId: nextUserId
                        }));
                      } else {
                        setForm((s) => ({ ...s, personHandlingUserId: '' }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  >
                    <option value="">Other (type)</option>
                    {handlerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Date Received</label>
                  <input
                    type="date"
                    value={form.dateReceived}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, dateReceived: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Person Handling Name (snapshot)</label>
                  <input
                    value={form.personHandlingNameSnapshot}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, personHandlingNameSnapshot: e.target.value }))}
                    placeholder="Type manually for external person"
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Description</label>
                  <textarea
                    rows={4}
                    value={form.description}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Action taken</label>
                  <textarea
                    rows={3}
                    value={form.actionTaken}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, actionTaken: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
                  <select
                    value={form.status}
                    disabled={readOnly || !canCloseEscalate}
                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as CustomerComplaintStatus }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {CUSTOMER_COMPLAINT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Customer feedback</label>
                  <textarea
                    rows={3}
                    value={form.customerFeedback}
                    disabled={readOnly}
                    onChange={(e) => setForm((s) => ({ ...s, customerFeedback: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm disabled:opacity-70"
                  />
                </div>
              </div>

              {(formMode === 'create' || formMode === 'edit') && canEdit && (
                <div className="bg-surface-50 border border-surface-200 rounded-xl p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.createLinkedNcr}
                      onChange={(e) => setForm((s) => ({ ...s, createLinkedNcr: e.target.checked }))}
                      disabled={formMode !== 'create'}
                    />
                    Create NCR/CAPA from this complaint
                  </label>
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.createLinkedTask}
                      onChange={(e) => setForm((s) => ({ ...s, createLinkedTask: e.target.checked }))}
                      disabled={formMode !== 'create'}
                    />
                    Create Task for corrective action follow-up
                  </label>
                  {form.createLinkedTask && (
                    <select
                      value={form.linkedTaskAssigneeUserId}
                      onChange={(e) => setForm((s) => ({ ...s, linkedTaskAssigneeUserId: (e.target.value || '') as UUID | '' }))}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    >
                      <option value="">Assignee (optional)</option>
                      {handlerOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {form.id && activeCompanyId && user?.id && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAttachmentComplaint(
                        (complaints ?? []).find((x) => x.id === form.id) ?? {
                          id: form.id as UUID,
                          company_id: activeCompanyId,
                          site_id: null,
                          department_id: null,
                          complaint_ref_no: form.complaintRefNo,
                          customer_name: form.customerName,
                          person_handling_user_id: form.personHandlingUserId || null,
                          person_handling_name_snapshot: form.personHandlingNameSnapshot,
                          date_received: form.dateReceived,
                          description: form.description,
                          action_taken: form.actionTaken || null,
                          status: form.status,
                          customer_feedback: form.customerFeedback || null,
                          evidence_file_ids: null,
                          linked_ncr_id: null,
                          linked_task_id: null,
                          closed_at: null,
                          closed_by_user_id: null,
                          created_by_user_id: user.id as UUID,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString()
                        }
                      )
                    }
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  >
                    Manage Attachments
                  </button>
                  {(complaints ?? []).find((x) => x.id === form.id)?.linked_ncr_id && (
                    <button
                      type="button"
                      onClick={() => navigate('/ncrs')}
                      className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                    >
                      View NCR
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-surface-200 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium">
                Cancel
              </button>
              {formMode !== 'view' && canWrite && (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {attachmentComplaint && activeCompanyId && user?.id && (
        <EvidenceModal
          open={!!attachmentComplaint}
          onClose={() => setAttachmentComplaint(null)}
          companyId={activeCompanyId}
          actorUserId={user.id as UUID}
          entityType="customer_complaint"
          entityId={attachmentComplaint.id}
          title={`Complaint Attachments - ${attachmentComplaint.complaint_ref_no}`}
        />
      )}
    </Layout>
  );
}
