import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createHrAcknowledgementDocument,
  createHrPersonalDocument,
  deleteHrAcknowledgementDocument,
  deleteHrPersonalDocument,
  getDocumentExpiryStatus,
  getHrEmployeeByUserId,
  listHrAcknowledgementDocuments,
  listHrEmployees,
  listHrPersonalDocuments,
  submitHrAcknowledgement,
  updateHrPersonalDocument,
  sendHrDocumentExpiryAlerts
} from '../../api/services/hrService';
import { listDepartments } from '../../api/services/departmentsService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { createEvidence, listEvidence } from '../../api/services/evidenceService';
import { uploadFile, getPublicUrl, type StorageBucket } from '../../api/services/storageService';
import type { UUID, CompanyRole } from '../../api/models/core';
import { createActivityLog } from '../../api/services/activityLogService';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { HrExportMenu } from '../../components/hr/HrExportMenu';

type Tab = 'personal' | 'acknowledgement';

function isFullAccess(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager';
}
function isOwnerSummary(role: CompanyRole | null): boolean {
  return role === 'owner';
}
function isSupervisor(role: CompanyRole | null): boolean {
  return role === 'supervisor';
}

export function HrDocumentsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('personal');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState('');
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sendExpiryNotification, setSendExpiryNotification] = useState(false);
  const [expiryNotificationEmail, setExpiryNotificationEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'active' | 'expiring_30' | 'expiring_7' | 'expired' | 'archived'>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [deletingPersonalId, setDeletingPersonalId] = useState<UUID | null>(null);

  const [ackTitle, setAckTitle] = useState('');
  const [ackCategory, setAckCategory] = useState('Policy');
  const [ackVersion, setAckVersion] = useState('');
  const [ackEffectiveDate, setAckEffectiveDate] = useState('');
  const [ackReviewDate, setAckReviewDate] = useState('');
  const [ackAssignedAll, setAckAssignedAll] = useState(true);
  const [ackAssignedRoleCsv, setAckAssignedRoleCsv] = useState('');
  const [ackRequired, setAckRequired] = useState(true);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [ackFile, setAckFile] = useState<File | null>(null);
  const [deletingAckId, setDeletingAckId] = useState<UUID | null>(null);
  const [pendingAckDocId, setPendingAckDocId] = useState<UUID | null>(null);
  const [pendingAckSign, setPendingAckSign] = useState(false);
  const [ackConfirmed, setAckConfirmed] = useState(false);
  const [ackSubmitting, setAckSubmitting] = useState(false);

  const canEdit = isFullAccess(activeRole ?? null) || Boolean((user as any)?.is_hr_manager);
  const ownerSummaryOnly = isOwnerSummary(activeRole ?? null);

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: selfEmployee } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as UUID);
  }, [activeCompanyId, user?.id]);

  const { data: departments } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listDepartments(activeCompanyId);
  }, [activeCompanyId]);

  const { data: personalDocs, loading: personalLoading, refetch: refetchPersonal } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    return listHrPersonalDocuments({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID
    });
  }, [activeCompanyId, activeRole, user?.id]);

  const { data: ackDocs, loading: ackLoading, refetch: refetchAck } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    return listHrAcknowledgementDocuments({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID
    });
  }, [activeCompanyId, activeRole, user?.id]);

  const employeeById = useMemo(() => new Map((employees ?? []).map((e) => [e.id as UUID, e])), [employees]);

  const filteredPersonalDocs = useMemo(() => {
    return (personalDocs ?? []).filter((row) => {
      const employee = employeeById.get(row.employee_id as UUID);
      const name = employee ? `${employee.first_name} ${employee.last_name}`.toLowerCase() : '';
      const q = query.trim().toLowerCase();
      if (q) {
        const hay = `${row.doc_name ?? row.title} ${row.doc_type} ${name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (docTypeFilter && row.doc_type.toLowerCase() !== docTypeFilter.toLowerCase()) return false;
      const expiryStatus = getDocumentExpiryStatus(row);
      if (expiryFilter !== 'all' && expiryStatus !== expiryFilter) return false;
      if (departmentFilter) {
        if (!employee?.department_id || String(employee.department_id) !== departmentFilter) return false;
      }
      return true;
    });
  }, [personalDocs, employeeById, query, docTypeFilter, expiryFilter, departmentFilter]);

  const personalTypeOptions = useMemo(
    () => Array.from(new Set((personalDocs ?? []).map((d) => d.doc_type).filter(Boolean))).map((v) => ({ id: v, value: v, label: v })),
    [personalDocs]
  );

  const complianceSummary = useMemo(() => {
    const docs = personalDocs ?? [];
    const expired = docs.filter((d) => getDocumentExpiryStatus(d) === 'expired').length;
    const expiring = docs.filter((d) => getDocumentExpiryStatus(d) === 'expiring_30' || getDocumentExpiryStatus(d) === 'expiring_7').length;
    const total = docs.length;
    const score = total ? Math.max(0, Math.round(((total - expired) / total) * 100)) : 100;
    return { total, expired, expiring, score };
  }, [personalDocs]);

  async function uploadAndAttachEvidence(entityType: string, entityId: UUID, upload: File, displayName: string): Promise<UUID> {
    const safeName = upload.name.replace(/\s+/g, '-');
    const key = `hr/${entityType}/${entityId}/${Date.now()}-${safeName}`;
    const result = await uploadFile('sca-documents' as StorageBucket, upload, { key });
    const ev = await createEvidence({
      companyId: activeCompanyId as UUID,
      entityType,
      entityId,
      title: displayName,
      displayTitle: displayName,
      originalFilename: upload.name,
      storageBucket: result.bucket,
      storageKey: result.key,
      fileKind: upload.type.startsWith('image/') ? 'image' : 'document',
      createdByUserId: user?.id as UUID
    });
    return ev.id as UUID;
  }

  async function onCreatePersonal() {
    if (!activeCompanyId || !user?.id || !employeeId || !docName.trim() || !docType.trim()) return;
    if (file && file.size > 10 * 1024 * 1024) {
      setError('File size must be 10 MB or less.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const created = await createHrPersonalDocument({
        companyId: activeCompanyId,
        employeeId: employeeId as UUID,
        docName: docName.trim(),
        docType: docType.trim(),
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
        notes: notes || null,
        fileIds: [],
        uploadedByUserId: user.id as UUID
      });
      if (file) {
        const evidenceId = await uploadAndAttachEvidence('hr_employee_document', created.id as UUID, file, docName.trim());
        await updateHrPersonalDocument({
          companyId: activeCompanyId,
          documentId: created.id as UUID,
          actorUserId: user.id as UUID,
          patch: { file_ids: [evidenceId] }
        });
      }
      // Persist notification preference — silently ignored if DB columns don't yet exist
      if (sendExpiryNotification) {
        await updateHrPersonalDocument({
          companyId: activeCompanyId,
          documentId: created.id as UUID,
          actorUserId: user.id as UUID,
          patch: {
            send_expiry_notification: true,
            expiry_notification_email: expiryNotificationEmail.trim() || null
          }
        }).catch(() => undefined);
      }
      setDocName('');
      setDocType('');
      setIssueDate('');
      setExpiryDate('');
      setNotes('');
      setFile(null);
      setSendExpiryNotification(false);
      setExpiryNotificationEmail('');
      setSuccess('Record saved.');
      await refetchPersonal();
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to save document record. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateAckDoc() {
    if (!activeCompanyId || !user?.id || !ackTitle.trim()) return;
    if (ackFile && ackFile.size > 10 * 1024 * 1024) {
      setError('File size must be 10 MB or less.');
      return;
    }
    setError(null);
    try {
      const created = await createHrAcknowledgementDocument({
        companyId: activeCompanyId,
        actorUserId: user.id as UUID,
        title: ackTitle.trim(),
        category: ackCategory.trim() || 'Policy',
        fileIds: [],
        version: ackVersion || null,
        effectiveDate: ackEffectiveDate || null,
        reviewDate: ackReviewDate || null,
        assignedAll: ackAssignedAll,
        assignedRoles: ackAssignedAll ? null : ackAssignedRoleCsv.split(',').map((x) => x.trim()).filter(Boolean),
        acknowledgementRequired: ackRequired,
        signatureRequired
      });
      if (ackFile) {
        const evidenceId = await uploadAndAttachEvidence('hr_ack_document', created.id as UUID, ackFile, ackTitle.trim());
        const { insforge } = await import('../../api/insforge/client');
        const { error: patchError } = await insforge.database
          .from('hr_ack_documents')
          .update({ file_ids: [evidenceId], updated_at: new Date().toISOString() })
          .eq('company_id', activeCompanyId)
          .eq('id', created.id);
        if (patchError) throw patchError;
      }
      setAckTitle('');
      setAckVersion('');
      setAckAssignedRoleCsv('');
      setAckFile(null);
      setSuccess('Record saved.');
      await refetchAck();
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to create acknowledgement document. Please try again.'));
    }
  }

  async function onAcknowledge(docId: UUID, sign = false) {
    if (!activeCompanyId || !user?.id) return;
    setAckSubmitting(true);
    try {
      const device = `${navigator.platform || 'unknown'} | ${navigator.userAgent || 'unknown'}`.slice(0, 400);
      await submitHrAcknowledgement({
        companyId: activeCompanyId,
        actorUserId: user.id as UUID,
        ackDocumentId: docId,
        action: sign ? 'sign' : 'acknowledge',
        ipAddress: null,
        deviceInfo: device
      });
      await refetchAck();
    } finally {
      setAckSubmitting(false);
      setPendingAckDocId(null);
      setAckConfirmed(false);
    }
  }

  function openAckModal(docId: UUID, sign: boolean) {
    setPendingAckDocId(docId);
    setPendingAckSign(sign);
    setAckConfirmed(false);
  }

  useEffect(() => {
    if (!pendingAckDocId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !ackSubmitting) {
        setPendingAckDocId(null);
        setAckConfirmed(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingAckDocId, ackSubmitting]);

  async function onRenameDoc(docId: UUID, name: string) {
    if (!activeCompanyId || !user?.id || !name.trim()) return;
    await updateHrPersonalDocument({
      companyId: activeCompanyId,
      documentId: docId,
      actorUserId: user.id as UUID,
      patch: { doc_name: name.trim() }
    });
    await refetchPersonal();
  }

  async function onArchivePersonal(docId: UUID) {
    if (!activeCompanyId || !user?.id || !canEdit) return;
    if (!window.confirm('Archive this document? You can still export and report on it, but it will be treated as archived.')) return;
    setError(null);
    try {
      await updateHrPersonalDocument({
        companyId: activeCompanyId,
        documentId: docId,
        actorUserId: user.id as UUID,
        patch: { status: 'ARCHIVED' }
      });
      await refetchPersonal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive document.');
    }
  }

  async function onDeletePersonal(docId: UUID) {
    if (!activeCompanyId || !user?.id || !canEdit) return;
    if (!window.confirm('Delete this document record? This cannot be undone.')) return;
    setError(null);
    setDeletingPersonalId(docId);
    try {
      await deleteHrPersonalDocument({
        companyId: activeCompanyId,
        documentId: docId,
        actorUserId: user.id as UUID
      });
      await refetchPersonal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete personal document.');
    } finally {
      setDeletingPersonalId(null);
    }
  }

  async function onDeleteAckDoc(docId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    if (!(canEdit || isSupervisor(activeRole ?? null))) return;
    if (!window.confirm('Delete this acknowledgement/policy document and all receipts? This cannot be undone.')) return;
    setError(null);
    setDeletingAckId(docId);
    try {
      await deleteHrAcknowledgementDocument({
        companyId: activeCompanyId,
        documentId: docId,
        actorUserId: user.id as UUID
      });
      await refetchAck();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete acknowledgement document.');
    } finally {
      setDeletingAckId(null);
    }
  }

  async function firstEvidenceUrl(entityType: string, entityId: UUID): Promise<string | null> {
    if (!activeCompanyId) return null;
    const evidence = await listEvidence(activeCompanyId, { entityType, entityId, limit: 1 }).catch(() => []);
    if (!evidence.length) return null;
    const ev = evidence[0];
    return getPublicUrl(ev.storage_bucket as StorageBucket, ev.storage_key);
  }

  async function logDocumentAccess(docId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    await createActivityLog({
      companyId: activeCompanyId,
      actorUserId: user.id as UUID,
      action: 'hr.personal_document.view',
      entityType: 'hr_employee_document',
      entityId: docId
    }).catch(() => undefined);
  }

  async function onSendExpiryAlerts() {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      const count = await sendHrDocumentExpiryAlerts(activeCompanyId, user.id as UUID);
      setSuccess(`Sent ${count} expiry notification${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send expiry notifications.');
    }
  }

  return (
    <Layout title="HR Documents">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-3 flex flex-wrap gap-2">
          <button className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === 'personal' ? 'bg-teal text-white' : 'hover:bg-surface-100'}`} onClick={() => setTab('personal')}>Employee Personal Documents</button>
          <button className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === 'acknowledgement' ? 'bg-teal text-white' : 'hover:bg-surface-100'}`} onClick={() => setTab('acknowledgement')}>Acknowledgement / Policy Documents</button>
        </div>

        {ownerSummaryOnly && (
          <div className="bg-white border border-surface-300 rounded-xl p-4">
            <h3 className="font-semibold">Owner Compliance Summary</h3>
            <p className="text-sm text-charcoal-600 mt-1">Total docs: {complianceSummary.total} | Expiring: {complianceSummary.expiring} | Expired: {complianceSummary.expired} | Compliance score: {complianceSummary.score}%</p>
          </div>
        )}

        {tab === 'personal' && (
          <>
            <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold">Save document record</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <HrEmployeeSelect
                    companyId={activeCompanyId ?? null}
                    value={employeeId as any}
                    valueField="id"
                    includeUnlinked={true}
                    onChange={(val) => setEmployeeId(val)}
                    label="Employee"
                    placeholder="Search employee..."
                    disabled={!canEdit && !isSupervisor(activeRole ?? null)}
                  />
                </div>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Document name</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={docName} onChange={(e) => setDocName(e.target.value)} /></label>
                <SelectOrType label="Document type" value={docType} onChange={(v) => setDocType(v)} options={personalTypeOptions} companyId={activeCompanyId ?? undefined} moduleKey="hr" fieldKey="personal_document_type" createdByUserId={(user?.id as UUID | undefined) ?? undefined} allowCreate={!!activeCompanyId} />
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Issue date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Expiry date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">File</span><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="w-full border border-surface-300 rounded-lg px-3 py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                <div className="text-sm space-y-2">
                  <span className="block text-xs text-charcoal-500">Send expiry notification?</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendExpiryNotification}
                      onChange={(e) => setSendExpiryNotification(e.target.checked)}
                      className="w-4 h-4 accent-teal"
                    />
                    <span className="font-medium">{sendExpiryNotification ? 'Yes' : 'No'}</span>
                  </label>
                  {sendExpiryNotification && (
                    <input
                      type="email"
                      className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Notification email address"
                      value={expiryNotificationEmail}
                      onChange={(e) => setExpiryNotificationEmail(e.target.value)}
                    />
                  )}
                </div>
                <label className="text-sm sm:col-span-2 md:col-span-3"><span className="block text-xs text-charcoal-500 mb-1">Notes</span><textarea className="w-full border border-surface-300 rounded-lg px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onCreatePersonal()} disabled={saving || (!canEdit && !isSupervisor(activeRole ?? null))}>
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
                {canEdit && <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => void onSendExpiryAlerts()}>Send expiry alerts</button>}
              </div>
            </div>

            <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold">Search / Filter / Reporting</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Search employee/document" value={query} onChange={(e) => setQuery(e.target.value)} />
                <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Filter by document type" value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)} />
                <select
                  className="border border-surface-300 rounded-lg px-3 py-2 text-sm"
                  value={expiryFilter}
                  onChange={(e) => setExpiryFilter(e.target.value as 'all' | 'active' | 'expiring_30' | 'expiring_7' | 'expired' | 'archived')}
                >
                  <option value="all">All expiry statuses</option>
                  <option value="active">Active</option>
                  <option value="expiring_30">Expiring in 30 days</option>
                  <option value="expiring_7">Expiring in 7 days</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
                <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option value="">All departments</option>
                  {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <HrExportMenu
                  moduleName="HR Documents — Expired"
                  columns={[
                    { key: 'employee', label: 'Employee' },
                    { key: 'document_name', label: 'Document Name' },
                    { key: 'document_type', label: 'Document Type' },
                    { key: 'expiry_date', label: 'Expiry Date' },
                    { key: 'status', label: 'Status' }
                  ]}
                  rows={filteredPersonalDocs
                    .filter((d) => getDocumentExpiryStatus(d) === 'expired')
                    .map((d) => {
                      const e = employeeById.get(d.employee_id as UUID);
                      return {
                        employee: e ? `${e.first_name} ${e.last_name}` : d.employee_id,
                        document_name: d.doc_name ?? d.title,
                        document_type: d.doc_type,
                        expiry_date: d.expiry_date,
                        status: getDocumentExpiryStatus(d)
                      };
                    })}
                />
              </div>
            </div>

            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              {personalLoading ? (
                <div className="flex justify-center py-10"><LoadingSpinner /></div>
              ) : filteredPersonalDocs.length === 0 ? (
                <div className="text-center py-10 text-sm text-charcoal-500">No documents yet.</div>
              ) : (
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-3 py-2">Employee</th>
                    <th className="text-left px-3 py-2">Document name</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Issue / Expiry</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Acknowledgement</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonalDocs.map((row) => {
                    const emp = employeeById.get(row.employee_id as UUID);
                    const exp = getDocumentExpiryStatus(row);
                    return (
                      <tr key={row.id} className="border-t border-surface-100">
                        <td className="px-3 py-2">{emp ? `${emp.first_name} ${emp.last_name}` : String(row.employee_id)}</td>
                        <td className="px-3 py-2">
                          <input
                            className="border border-surface-300 rounded px-2 py-1 text-sm w-full"
                            defaultValue={String(row.doc_name ?? row.title ?? '')}
                            onBlur={(e) => { if (canEdit) void onRenameDoc(row.id as UUID, e.target.value); }}
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-2">{String(row.doc_type ?? '')}</td>
                        <td className="px-3 py-2">{String(row.issue_date ?? '-')} / {String(row.expiry_date ?? '-')}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${exp === 'expired' ? 'bg-critical/20 text-critical' : exp === 'expiring_7' ? 'bg-warning/20 text-warning' : exp === 'expiring_30' ? 'bg-yellow-100 text-yellow-700' : 'bg-surface-100 text-charcoal-600'}`}>{exp}</span>
                        </td>
                        <td className="px-3 py-2">
                          {(row as any).acknowledged_by_employee ? (
                            <span className="text-xs text-emerald-700">Acknowledged {(row as any).acknowledged_at ? new Date(String((row as any).acknowledged_at)).toLocaleDateString() : ''}</span>
                          ) : selfEmployee && String(row.employee_id) === String(selfEmployee.id) ? (
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                onChange={async () => {
                                  await updateHrPersonalDocument({
                                    companyId: activeCompanyId!,
                                    documentId: row.id as UUID,
                                    actorUserId: user!.id as UUID,
                                    patch: {
                                      acknowledged_by_employee: true,
                                      acknowledged_at: new Date().toISOString()
                                    }
                                  });
                                  await refetchPersonal();
                                }}
                              />
                              I have read this
                            </label>
                          ) : (
                            <span className="text-xs text-charcoal-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-3">
                            <button
                              className="text-teal underline"
                              onClick={async () => {
                                void logDocumentAccess(row.id as UUID);
                                const url = await firstEvidenceUrl('hr_employee_document', row.id as UUID);
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                else alert('No file uploaded for this document.');
                              }}
                            >
                              Preview
                            </button>
                            {canEdit && exp !== 'archived' && (
                              <button className="text-charcoal-700 underline" onClick={() => void onArchivePersonal(row.id as UUID)}>
                                Archive
                              </button>
                            )}
                            {canEdit && (
                              <button
                                className="text-critical underline disabled:opacity-50"
                                onClick={() => void onDeletePersonal(row.id as UUID)}
                                disabled={deletingPersonalId === (row.id as UUID)}
                              >
                                {deletingPersonalId === (row.id as UUID) ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          </>
        )}

        {tab === 'acknowledgement' && (
          <>
            {(canEdit || isSupervisor(activeRole ?? null)) && (
              <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold">Create acknowledgement / policy document</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Document title</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={ackTitle} onChange={(e) => setAckTitle(e.target.value)} /></label>
                  <SelectOrType label="Category" value={ackCategory} onChange={(v) => setAckCategory(v)} options={[{ id: 'Policy', value: 'Policy', label: 'Policy' }, { id: 'Procedure', value: 'Procedure', label: 'Procedure' }, { id: 'Form', value: 'Form', label: 'Form' }, { id: 'Other', value: 'Other', label: 'Other' }]} companyId={activeCompanyId ?? undefined} moduleKey="hr" fieldKey="ack_document_category" createdByUserId={(user?.id as UUID | undefined) ?? undefined} allowCreate={!!activeCompanyId} />
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Version</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={ackVersion} onChange={(e) => setAckVersion(e.target.value)} /></label>
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Effective date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={ackEffectiveDate} onChange={(e) => setAckEffectiveDate(e.target.value)} /></label>
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Review date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={ackReviewDate} onChange={(e) => setAckReviewDate(e.target.value)} /></label>
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">File</span><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="w-full border border-surface-300 rounded-lg px-3 py-2" onChange={(e) => setAckFile(e.target.files?.[0] ?? null)} /></label>
                  <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={ackAssignedAll} onChange={(e) => setAckAssignedAll(e.target.checked)} />Assign to all employees</label>
                  <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Assigned roles (CSV)</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={ackAssignedRoleCsv} onChange={(e) => setAckAssignedRoleCsv(e.target.value)} placeholder="employee,supervisor" disabled={ackAssignedAll} /></label>
                  <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={ackRequired} onChange={(e) => setAckRequired(e.target.checked)} />Acknowledgement required</label>
                  <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={signatureRequired} onChange={(e) => setSignatureRequired(e.target.checked)} />Signature required</label>
                </div>
                <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreateAckDoc()}>Create document</button>
              </div>
            )}

            {activeRole === 'employee' ? (
              <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
                {(ackDocs ?? []).length === 0 ? (
                  <div className="text-center py-8 text-charcoal-500 text-sm">No documents require your acknowledgement.</div>
                ) : (
                  (ackDocs ?? []).map((row) => {
                    const myReceipt = (row.receipts ?? [])[0];
                    const status = myReceipt?.status ?? 'PENDING';
                    return (
                      <div key={row.id} className="border border-surface-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <p className="font-medium text-sm text-charcoal truncate">{row.title}</p>
                          <p className="text-xs text-charcoal-500">{row.category}{row.version ? ` · v${row.version}` : ''}</p>
                          <p className="text-xs text-charcoal-500">
                            Assigned: {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                            {row.review_date ? ` · Required by: ${row.review_date}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {status === 'SIGNED' && (
                            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">Signed</span>
                          )}
                          {status === 'ACKNOWLEDGED' && (
                            <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Acknowledged</span>
                          )}
                          {status === 'PENDING' && (
                            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Pending</span>
                          )}
                          <button className="text-teal underline text-sm" onClick={async () => {
                            const url = await firstEvidenceUrl('hr_ack_document', row.id as UUID);
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            else alert('No file uploaded.');
                          }}>Preview</button>
                          {status !== 'ACKNOWLEDGED' && status !== 'SIGNED' && (
                            <button
                              className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs disabled:opacity-60"
                              onClick={() => openAckModal(row.id as UUID, false)}
                              disabled={ackSubmitting}
                            >Acknowledge</button>
                          )}
                          {row.signature_required && status !== 'SIGNED' && (
                            <button
                              className="px-3 py-1.5 rounded-lg border border-teal text-teal text-xs disabled:opacity-60"
                              onClick={() => openAckModal(row.id as UUID, true)}
                              disabled={ackSubmitting}
                            >Sign</button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
                {ackLoading ? (
                  <div className="flex justify-center py-10"><LoadingSpinner /></div>
                ) : (ackDocs ?? []).length === 0 ? (
                  <div className="text-center py-10 text-sm text-charcoal-500">No documents yet.</div>
                ) : (
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Title</th><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2">Version</th><th className="text-left px-3 py-2">Dates</th><th className="text-left px-3 py-2">Completion</th><th className="text-left px-3 py-2">Actions</th></tr></thead>
                  <tbody>
                    {(ackDocs ?? []).map((row) => {
                      const receipts = row.receipts ?? [];
                      const completed = receipts.filter((r) => r.status === 'ACKNOWLEDGED' || r.status === 'SIGNED').length;
                      const completion = receipts.length ? Math.round((completed / receipts.length) * 100) : 0;
                      return (
                        <tr key={row.id} className="border-t border-surface-100">
                          <td className="px-3 py-2">{row.title}</td>
                          <td className="px-3 py-2">{row.category}</td>
                          <td className="px-3 py-2">{row.version ?? '-'}</td>
                          <td className="px-3 py-2">{row.effective_date ?? '-'} / {row.review_date ?? '-'}</td>
                          <td className="px-3 py-2">{completion}% ({completed}/{receipts.length})</td>
                          <td className="px-3 py-2 space-x-2">
                            <button className="text-teal underline" onClick={async () => {
                              const url = await firstEvidenceUrl('hr_ack_document', row.id as UUID);
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              else alert('No file uploaded.');
                            }}>Preview</button>
                            {(canEdit || isSupervisor(activeRole ?? null)) && (
                              <button
                                className="text-critical underline disabled:opacity-50"
                                onClick={() => void onDeleteAckDoc(row.id as UUID)}
                                disabled={deletingAckId === (row.id as UUID)}
                              >
                                {deletingAckId === (row.id as UUID) ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {(canEdit || isSupervisor(activeRole ?? null)) && (
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <HrExportMenu
                  moduleName="HR Acknowledgement Completion"
                  columns={[
                    { key: 'document', label: 'Document' },
                    { key: 'status', label: 'Status' },
                    { key: 'employee_id', label: 'Employee ID' },
                    { key: 'acknowledged_at', label: 'Acknowledged At' },
                    { key: 'signed_at', label: 'Signed At' },
                    { key: 'device_info', label: 'Device Info' }
                  ]}
                  rows={(ackDocs ?? []).flatMap((d) => (d.receipts ?? []).map((r) => ({
                    document: d.title,
                    status: r.status,
                    employee_id: r.employee_id,
                    acknowledged_at: r.acknowledged_at,
                    signed_at: r.signed_at,
                    device_info: r.device_info
                  })))}
                />
              </div>
            )}
          </>
        )}
      </div>

      {pendingAckDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-charcoal">Document Acknowledgement</h3>
            <p className="text-sm text-charcoal-700 leading-relaxed">
              I hereby acknowledge that I have received, read, and understood the document provided.
            </p>
            <p className="text-sm text-charcoal-500">
              Please contact HR or your manager for any questions or queries regarding the document.
            </p>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ackConfirmed}
                onChange={(e) => setAckConfirmed(e.target.checked)}
                className="w-4 h-4 accent-teal"
              />
              <span>I confirm the above acknowledgement</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 rounded-lg border border-surface-300 text-sm"
                onClick={() => { setPendingAckDocId(null); setAckConfirmed(false); }}
                disabled={ackSubmitting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60"
                disabled={!ackConfirmed || ackSubmitting}
                onClick={() => void onAcknowledge(pendingAckDocId, pendingAckSign)}
              >
                {ackSubmitting ? 'Submitting...' : pendingAckSign ? 'Confirm & Sign' : 'Confirm & Acknowledge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
