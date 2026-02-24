import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import type { ReviewMeetingItemStatus, UUID } from '../api/models/entities';
import type { CompanyRole } from '../api/models/core';
import { listUserProfiles } from '../api/services/profilesService';
import { listCompanyMemberships } from '../api/services/tenantService';
import { useAsync } from '../api/hooks/useAsync';
import { UserMultiSelect } from '../components/ui/UserMultiSelect';
import {
  canEditReviewMeetingItem,
  canEditReviewMeeting,
  canSignReviewMeeting,
  createReviewMeeting,
  emailReviewMeetingReportWithAudit,
  generateReviewMeetingReport,
  getReviewMeeting,
  signReviewMeeting,
  unlockSignedReviewMeeting,
  updateReviewMeetingItem,
  updateReviewMeeting
} from '../api/services/reviewMeetingsService';
import { listLinkedImprovements } from '../api/services/improvementService';
import { createEvidence } from '../api/services/evidenceService';
import { uploadDocumentFile, downloadBlob, openBlobInNewTab } from '../api/services/documentsStorageService';
import { listDocuments } from '../api/services/documentsService';

const ITEM_STATUS_OPTIONS: ReviewMeetingItemStatus[] = ['OUTSTANDING', 'IN_PROGRESS', 'COMPLETED'];

type FormItem = {
  id?: UUID;
  reviewItem: string;
  discussionNotes: string;
  actionRequired: string;
  responsibleUserId: UUID | '';
  externalResponsibleName: string;
  targetDate: string;
  resourcesRequired: string;
  status: ReviewMeetingItemStatus;
  completionDate: string;
  evidenceFileIds: UUID[];
  linkedDocumentIds: UUID[];
  linkedTaskId?: UUID | null;
  updatesLog: Array<{ timestamp: string; note: string; userId: UUID | null }>;
  draftUpdateNote: string;
};

function createEmptyItem(): FormItem {
  return {
    reviewItem: '',
    discussionNotes: '',
    actionRequired: '',
    responsibleUserId: '',
    externalResponsibleName: '',
    targetDate: '',
    resourcesRequired: '',
    status: 'OUTSTANDING',
    completionDate: '',
    evidenceFileIds: [],
    linkedDocumentIds: [],
    updatesLog: [],
    draftUpdateNote: ''
  };
}

export function ReviewMeetingDetailPage() {
  const { meetingId } = useParams();
  const isCreate = !meetingId || meetingId === 'new';
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();

  const [title, setTitle] = useState('Management Review Meeting');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [attendeeUserIds, setAttendeeUserIds] = useState<UUID[]>([]);
  const [externalAttendeesText, setExternalAttendeesText] = useState('');
  const [emailUserIds, setEmailUserIds] = useState<UUID[]>([]);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [nextMeetingDate, setNextMeetingDate] = useState('');
  const [chairpersonUserId, setChairpersonUserId] = useState<UUID | ''>('');
  const [ceoApprovalRequired, setCeoApprovalRequired] = useState(false);
  const [autoEmailOnCreate, setAutoEmailOnCreate] = useState(true);
  const [autoEmailOnUpdate, setAutoEmailOnUpdate] = useState(false);
  const [autoCreateTasksFromItems, setAutoCreateTasksFromItems] = useState(false);
  const [items, setItems] = useState<FormItem[]>([createEmptyItem()]);
  const [statusLabel, setStatusLabel] = useState<'DRAFT' | 'ACTIVE' | 'SIGNED' | 'ARCHIVED'>('DRAFT');
  const [meetingStatus, setMeetingStatus] = useState<'DRAFT' | 'ACTIVE' | 'SIGNED' | 'ARCHIVED'>('DRAFT');
  const [signatureStatus, setSignatureStatus] = useState<'SIGNED' | 'NOT_SIGNED'>('NOT_SIGNED');
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSavingIndex, setItemSavingIndex] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: meetingData, loading: meetingLoading } = useAsync(
    async () => {
      if (!activeCompanyId || isCreate || !meetingId) return null;
      return await getReviewMeeting(activeCompanyId, meetingId as UUID);
    },
    [activeCompanyId, isCreate, meetingId]
  );

  const { data: profiles } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: memberships } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listCompanyMemberships(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: documents } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: linkedImprovements, refresh: refreshLinkedImprovements } = useAsync(
    async () => {
      if (!activeCompanyId || isCreate || !meetingId) return [];
      return await listLinkedImprovements({
        companyId: activeCompanyId,
        sourceType: 'management_review',
        sourceId: meetingId as UUID
      });
    },
    [activeCompanyId, isCreate, meetingId]
  );

  const profileByUserId = useMemo(() => {
    const map = new Map<string, { name: string; email: string | null }>();
    (profiles ?? []).forEach((profile) => {
      map.set(profile.user_id, {
        name: profile.full_name || profile.email || profile.user_id.slice(0, 8),
        email: profile.email ?? null
      });
    });
    return map;
  }, [profiles]);

  const memberOptions = useMemo(() => {
    return (memberships ?? []).map((member) => {
      const profile = profileByUserId.get(member.user_id);
      return {
        userId: member.user_id,
        label: profile?.name ?? member.user_id.slice(0, 8),
        email: profile?.email ?? null,
        role: member.role
      };
    });
  }, [memberships, profileByUserId]);

  useEffect(() => {
    if (!meetingData) return;
    const { meeting, items: loadedItems } = meetingData;
    setTitle(meeting.title ?? 'Management Review Meeting');
    setDate(meeting.date ?? '');
    setTime(meeting.time ?? '');
    setPlace(meeting.place ?? '');
    setAttendeeUserIds(meeting.attendee_user_ids ?? []);
    setExternalAttendeesText((meeting.external_attendees ?? []).join('\n'));
    setEmailList(meeting.email_list ?? []);
    setEmailUserIds([]);
    setNextMeetingDate(meeting.next_meeting_date ?? '');
    setChairpersonUserId((meeting.chairperson_user_id ?? '') as UUID | '');
    setCeoApprovalRequired(!!meeting.ceo_approval_required);
    setAutoEmailOnCreate(!!meeting.auto_email_on_create);
    setAutoEmailOnUpdate(!!meeting.auto_email_on_update);
    setAutoCreateTasksFromItems(!!meeting.auto_create_tasks_from_items);
    setStatusLabel(meeting.status);
    setMeetingStatus(meeting.status);
    setSignatureStatus(meeting.signature_status);
    setIsLocked(meeting.is_locked);
    setItems(
      loadedItems.length
        ? loadedItems.map((row) => ({
            id: row.id,
            reviewItem: row.review_item,
            discussionNotes: row.discussion_notes ?? '',
            actionRequired: row.action_required,
            responsibleUserId: (row.responsible_user_id ?? '') as UUID | '',
            externalResponsibleName: row.responsible_name_external ?? '',
            targetDate: row.target_date ?? '',
            resourcesRequired: row.resources_required ?? '',
            status: row.status,
            completionDate: row.completion_date ? row.completion_date.slice(0, 10) : '',
            evidenceFileIds: row.evidence_file_ids ?? [],
            linkedDocumentIds: row.linked_document_ids ?? [],
            linkedTaskId: row.linked_task_id ?? null,
            updatesLog: (row.updates_log ?? []).map((entry: any) => ({
              timestamp: String(entry.timestamp ?? ''),
              note: String(entry.note ?? ''),
              userId: (entry.user_id ?? null) as UUID | null
            })),
            draftUpdateNote: ''
          }))
        : [createEmptyItem()]
    );
  }, [meetingData]);

  const viewer = useMemo(() => {
    if (!user?.id || !activeRole || !activeCompanyId) return null;
    return {
      userId: user.id as UUID,
      role: activeRole,
      membership: memberships?.find((m) => m.company_id === activeCompanyId && m.user_id === user.id) ?? null,
      email: user.email ?? null
    };
  }, [activeCompanyId, activeRole, memberships, user?.email, user?.id]);

  const canEdit = useMemo(() => {
    if (isCreate) return ['admin', 'manager', 'supervisor'].includes(String(activeRole));
    if (!meetingData || !viewer) return false;
    return canEditReviewMeeting({ meeting: meetingData.meeting, items: meetingData.items, viewer });
  }, [activeRole, isCreate, meetingData, viewer]);

  const canSign = useMemo(() => {
    if (isCreate || !meetingData || !viewer) return false;
    return canSignReviewMeeting({ meeting: meetingData.meeting, viewer });
  }, [isCreate, meetingData, viewer]);

  function canEditItem(item: FormItem): boolean {
    if (canEdit) return true;
    return false;
  }

  function canUpdateItemProgress(item: FormItem): boolean {
    if (canEdit) return true;
    if (!meetingData || !viewer || !item.id) return false;
    const row = meetingData.items.find((entry) => entry.id === item.id);
    if (!row) return false;
    return canEditReviewMeetingItem({ meeting: meetingData.meeting, item: row, viewer });
  }

  function updateItem(index: number, patch: Partial<FormItem>): void {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem(): void {
    setItems((prev) => [...prev, createEmptyItem()]);
  }

  function removeItem(index: number): void {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function parseExternalLines(value: string): string[] {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function collectEmailListFromUserSelections(): string[] {
    const selectedUserEmails = emailUserIds
      .map((uid) => profileByUserId.get(uid)?.email)
      .filter((v): v is string => !!v)
      .map((v) => v.trim().toLowerCase());
    const all = [...emailList, ...selectedUserEmails].map((v) => v.trim().toLowerCase()).filter(Boolean);
    return [...new Set(all)];
  }

  function validateBeforeSave(): string | null {
    if (!date || !time || !place.trim()) return 'Date, time, and place are required.';
    if (!items.length) return 'At least one review item is required.';
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item.reviewItem.trim()) return `Item ${i + 1}: review item/topic is required.`;
      if (!item.actionRequired.trim()) return `Item ${i + 1}: action required is mandatory.`;
      if (!item.responsibleUserId && !item.externalResponsibleName.trim()) return `Item ${i + 1}: assign a responsible person.`;
      if (item.status === 'COMPLETED' && !item.completionDate) return `Item ${i + 1}: completion date is required when status is Completed.`;
    }
    return null;
  }

  async function handleSave(): Promise<void> {
    if (!activeCompanyId || !user?.id || !activeRole) return;
    const validationError = validateBeforeSave();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        companyId: activeCompanyId,
        actorUserId: user.id as UUID,
        actorRole: activeRole as CompanyRole,
        title,
        date,
        time,
        place,
        attendeeUserIds,
        externalAttendees: parseExternalLines(externalAttendeesText),
        emailList: collectEmailListFromUserSelections(),
        nextMeetingDate: nextMeetingDate || null,
        chairpersonUserId: (chairpersonUserId || null) as UUID | null,
        ceoApprovalRequired,
        status: meetingStatus,
        autoEmailOnCreate,
        autoEmailOnUpdate,
        autoCreateTasksFromItems,
        items: items.map((item) => ({
          id: item.id,
          reviewItem: item.reviewItem,
          discussionNotes: item.discussionNotes,
          actionRequired: item.actionRequired,
          responsibleUserId: (item.responsibleUserId || null) as UUID | null,
          externalResponsibleName: item.externalResponsibleName || null,
          targetDate: item.targetDate || null,
          resourcesRequired: item.resourcesRequired || null,
          status: item.status,
          completionDate: item.completionDate || null,
          evidenceFileIds: item.evidenceFileIds,
          linkedDocumentIds: item.linkedDocumentIds,
          updatesLog: item.updatesLog,
          linkedTaskId: item.linkedTaskId ?? null
        }))
      };
      if (isCreate || !meetingId) {
        const created = await createReviewMeeting(payload);
        navigate(`/document-reviews/${created.meeting.id}`);
      } else {
        const updated = await updateReviewMeeting({ ...payload, meetingId: meetingId as UUID });
        setStatusLabel(updated.meeting.status);
        setMeetingStatus(updated.meeting.status);
        setSignatureStatus(updated.meeting.signature_status);
        setIsLocked(updated.meeting.is_locked);
        setItems(
          updated.items.map((row) => ({
            id: row.id,
            reviewItem: row.review_item,
            discussionNotes: row.discussion_notes ?? '',
            actionRequired: row.action_required,
            responsibleUserId: (row.responsible_user_id ?? '') as UUID | '',
            externalResponsibleName: row.responsible_name_external ?? '',
            targetDate: row.target_date ?? '',
            resourcesRequired: row.resources_required ?? '',
            status: row.status,
            completionDate: row.completion_date ? row.completion_date.slice(0, 10) : '',
            evidenceFileIds: row.evidence_file_ids ?? [],
            linkedDocumentIds: row.linked_document_ids ?? [],
            linkedTaskId: row.linked_task_id ?? null,
            updatesLog: (row.updates_log ?? []).map((entry: any) => ({
              timestamp: String(entry.timestamp ?? ''),
              note: String(entry.note ?? ''),
              userId: (entry.user_id ?? null) as UUID | null
            })),
            draftUpdateNote: ''
          }))
        );
        alert('Review meeting updated.');
        await refreshLinkedImprovements();
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save review meeting.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSign(): Promise<void> {
    if (!activeCompanyId || !meetingId || !user?.id || !activeRole) return;
    const input = prompt('Type SIGN to confirm digital sign-off:');
    if (!input) return;
    setSigning(true);
    try {
      const signed = await signReviewMeeting({
        companyId: activeCompanyId,
        meetingId: meetingId as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole as CompanyRole,
        confirmationText: input
      });
      setStatusLabel(signed.meeting.status);
      setSignatureStatus(signed.meeting.signature_status);
      setIsLocked(signed.meeting.is_locked);
      alert('Meeting minutes signed and locked.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to sign meeting.');
    } finally {
      setSigning(false);
    }
  }

  async function handleUnlock(): Promise<void> {
    if (!activeCompanyId || !meetingId || !user?.id || !activeRole) return;
    const reason = prompt('Unlock reason (logged in audit trail):') ?? '';
    const unlocked = await unlockSignedReviewMeeting({
      companyId: activeCompanyId,
      meetingId: meetingId as UUID,
      actorUserId: user.id as UUID,
      actorRole: activeRole as CompanyRole,
      reason
    });
    setStatusLabel(unlocked.meeting.status);
    setIsLocked(unlocked.meeting.is_locked);
  }

  async function handleGenerateReport(): Promise<void> {
    if (!meetingData || !activeCompanyId || !user?.id) return;
    const attendeeLabels = attendeeUserIds.map((uid) => profileByUserId.get(uid)?.name ?? uid.slice(0, 8));
    const report = await generateReviewMeetingReport({
      companyId: activeCompanyId,
      meeting: meetingData.meeting,
      items: meetingData.items,
      actorUserId: user.id as UUID,
      attendeeLabels
    });
    const htmlBlob = new Blob([report.html], { type: 'text/html' });
    openBlobInNewTab(htmlBlob);
    downloadBlob(report.csv, `review-meeting-actions-${meetingData.meeting.id.slice(0, 8)}.csv`);
  }

  async function handleEmailReport(): Promise<void> {
    if (!activeCompanyId || !meetingData || !user?.id) return;
    const attendeeLabels = attendeeUserIds.map((uid) => profileByUserId.get(uid)?.name ?? uid.slice(0, 8));
    await emailReviewMeetingReportWithAudit({
      companyId: activeCompanyId,
      meeting: meetingData.meeting,
      items: meetingData.items,
      attendeeLabels,
      actorUserId: user.id as UUID,
      reason: 'manual'
    });
    alert('Report email dispatched.');
  }

  async function handleUploadEvidence(itemIndex: number, file: File | null): Promise<void> {
    if (!file || !activeCompanyId || !user?.id) return;
    const item = items[itemIndex];
    if (!item.id) {
      alert('Save the meeting first to upload evidence for this item.');
      return;
    }
    const uploaded = await uploadDocumentFile({ companyId: activeCompanyId, file });
    const evidence = await createEvidence({
      companyId: activeCompanyId,
      entityType: 'review_meeting_item',
      entityId: item.id,
      storageBucket: uploaded.bucket,
      storageKey: uploaded.key,
      originalFilename: file.name,
      displayTitle: file.name,
      fileKind: file.type.startsWith('image/') ? 'image' : 'document',
      createdByUserId: user.id as UUID
    });
    updateItem(itemIndex, { evidenceFileIds: [...new Set([...(item.evidenceFileIds ?? []), evidence.id])] });
  }

  async function handleSaveItem(index: number): Promise<void> {
    if (!activeCompanyId || !meetingId || !user?.id || !activeRole) return;
    const item = items[index];
    if (!item.id) return;
    if (item.status === 'COMPLETED' && !item.completionDate) {
      setError(`Item ${index + 1}: completion date is required when status is Completed.`);
      return;
    }
    setItemSavingIndex(index);
    try {
      const updated = await updateReviewMeetingItem({
        companyId: activeCompanyId,
        meetingId: meetingId as UUID,
        itemId: item.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole as CompanyRole,
        patch: {
          reviewItem: item.reviewItem,
          discussionNotes: item.discussionNotes,
          actionRequired: item.actionRequired,
          responsibleUserId: (item.responsibleUserId || null) as UUID | null,
          externalResponsibleName: item.externalResponsibleName || null,
          targetDate: item.targetDate || null,
          resourcesRequired: item.resourcesRequired || null,
          status: item.status,
          completionDate: item.completionDate || null,
          evidenceFileIds: item.evidenceFileIds,
          linkedDocumentIds: item.linkedDocumentIds,
          linkedTaskId: item.linkedTaskId ?? null,
          updateNote: item.draftUpdateNote
        }
      });
      updateItem(index, {
        status: updated.status,
        completionDate: updated.completion_date ? updated.completion_date.slice(0, 10) : '',
        draftUpdateNote: '',
        updatesLog: (updated.updates_log ?? []).map((entry: any) => ({
          timestamp: String(entry.timestamp ?? ''),
          note: String(entry.note ?? ''),
          userId: (entry.user_id ?? null) as UUID | null
        }))
      });
      alert('Action item updated.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update action item.');
    } finally {
      setItemSavingIndex(null);
    }
  }

  if (!activeCompanyId) return <Layout title="Review Meeting Details"><p className="text-sm text-charcoal-500">Select an organization first.</p></Layout>;
  if (!isCreate && meetingLoading) return <Layout title="Review Meeting Details"><p className="text-sm text-charcoal-500">Loading meeting...</p></Layout>;

  return (
    <Layout title={isCreate ? 'Create Management Review Meeting' : 'Review Meeting Details'}>
      <div className="space-y-5 pb-10">
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/document-reviews" className="text-sm text-teal hover:underline">Back to review meetings</Link>
            <h2 className="text-lg font-semibold text-charcoal mt-1">{title || 'Management Review Meeting'}</h2>
            <p className="text-xs text-charcoal-500">Status: {statusLabel} | Signature: {signatureStatus} | {isLocked ? 'Read-only (signed)' : 'Editable'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isCreate && (
              <>
                <button type="button" onClick={() => void handleGenerateReport()} className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium hover:bg-surface-50">Generate Report</button>
                <button type="button" onClick={() => void handleEmailReport()} className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium hover:bg-surface-50">Email Report</button>
                {!isCreate && meetingId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/improvement/new?sourceType=management_review&sourceId=${meetingId}`)}
                    className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium hover:bg-surface-50"
                  >
                    Create Improvement Action
                  </button>
                )}
                {signatureStatus !== 'SIGNED' && (
                  <button type="button" onClick={() => void handleSign()} disabled={signing || !canSign} className="px-3 py-2 rounded-lg bg-navy text-white text-sm font-medium disabled:opacity-60">Sign Meeting Minutes</button>
                )}
                {signatureStatus === 'SIGNED' && ['owner', 'admin', 'manager'].includes(String(activeRole)) && (
                  <button type="button" onClick={() => void handleUnlock()} className="px-3 py-2 rounded-lg border border-warning/50 text-warning text-sm font-medium">Unlock Signed Minutes</button>
                )}
              </>
            )}
            <button type="button" onClick={() => void handleSave()} disabled={!canEdit || saving} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium disabled:opacity-60">{saving ? 'Saving...' : isCreate ? 'Create Meeting' : 'Save Changes'}</button>
          </div>
        </div>

        {error && <div className="bg-critical/5 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}

        {!isCreate && (
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card space-y-1">
            <h3 className="font-semibold text-charcoal">Minutes Summary</h3>
            <p className="text-sm text-charcoal-600">
              <strong>Date:</strong> {date || '-'} | <strong>Time:</strong> {time || '-'} | <strong>Place:</strong> {place || '-'}
            </p>
            <p className="text-sm text-charcoal-600">
              <strong>Attendees:</strong> {attendeeUserIds.length + parseExternalLines(externalAttendeesText).length}
            </p>
            <p className="text-sm text-charcoal-600">
              <strong>Open Items:</strong> {items.filter((item) => item.status !== 'COMPLETED').length} | <strong>Completed:</strong> {items.filter((item) => item.status === 'COMPLETED').length}
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card grid gap-3 md:grid-cols-2">
          <label className="text-sm"><span className="block mb-1 text-charcoal-500">Meeting title</span><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Meeting status</span>
            <select value={meetingStatus} onChange={(e) => setMeetingStatus(e.target.value as 'DRAFT' | 'ACTIVE' | 'SIGNED' | 'ARCHIVED')} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
              <option value="SIGNED" disabled>Signed</option>
            </select>
          </label>
          <label className="text-sm"><span className="block mb-1 text-charcoal-500">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          <label className="text-sm"><span className="block mb-1 text-charcoal-500">Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          <label className="text-sm"><span className="block mb-1 text-charcoal-500">Place</span><input value={place} onChange={(e) => setPlace(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Chairperson / CEO approver</span>
            <select value={chairpersonUserId} onChange={(e) => setChairpersonUserId(e.target.value as UUID | '')} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Select person</option>
              {memberOptions.map((opt) => <option key={opt.userId} value={opt.userId}>{opt.label} {opt.role ? `(${opt.role})` : ''}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="block mb-1 text-charcoal-500">Next management review meeting date</span><input type="date" value={nextMeetingDate} onChange={(e) => setNextMeetingDate(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={ceoApprovalRequired} onChange={(e) => setCeoApprovalRequired(e.target.checked)} disabled={!canEdit} />CEO approval required</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={autoEmailOnCreate} onChange={(e) => setAutoEmailOnCreate(e.target.checked)} disabled={!canEdit} />Auto-email report on creation</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={autoEmailOnUpdate} onChange={(e) => setAutoEmailOnUpdate(e.target.checked)} disabled={!canEdit} />Auto-email report on updates</label>
            <label className="inline-flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={autoCreateTasksFromItems} onChange={(e) => setAutoCreateTasksFromItems(e.target.checked)} disabled={!canEdit} />Auto-create tasks for action items that have responsible person and target date</label>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card space-y-3">
          <h3 className="font-semibold text-charcoal">Attendees</h3>
          <UserMultiSelect companyId={activeCompanyId} selectedUserIds={attendeeUserIds} selectedEmails={[]} onChange={(userIds) => setAttendeeUserIds(userIds as UUID[])} allowExternalEmails={false} disabled={!canEdit} placeholder="Select internal attendees" />
          <label className="text-sm block"><span className="block mb-1 text-charcoal-500">External attendee names (one per line)</span><textarea rows={3} value={externalAttendeesText} onChange={(e) => setExternalAttendeesText(e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
        </div>

        {!isCreate && (
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <h3 className="font-semibold text-charcoal mb-2">Linked Improvements</h3>
            {(!linkedImprovements || linkedImprovements.length === 0) && <p className="text-sm text-charcoal-500">No linked improvements yet.</p>}
            {linkedImprovements && linkedImprovements.length > 0 && (
              <div className="space-y-1">
                {linkedImprovements.map((imp: any) => (
                  <p key={imp.id} className="text-sm text-charcoal-600">
                    <span className="font-medium">{imp.reference_number}</span> - {imp.status}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card space-y-3">
          <h3 className="font-semibold text-charcoal">Email List (org users + external emails)</h3>
          <UserMultiSelect
            companyId={activeCompanyId}
            selectedUserIds={emailUserIds}
            selectedEmails={emailList}
            onChange={(userIds, emails) => { setEmailUserIds(userIds as UUID[]); setEmailList(emails); }}
            allowExternalEmails
            disabled={!canEdit}
            placeholder="Recipients"
          />
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
            <h3 className="font-semibold text-charcoal">Review Items</h3>
            <button type="button" onClick={addItem} disabled={!canEdit} className="px-3 py-1.5 rounded border border-surface-300 text-sm disabled:opacity-60">Add Row</button>
          </div>
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-3 py-2 text-left">Topic / review item</th><th className="px-3 py-2 text-left">Discussion notes</th><th className="px-3 py-2 text-left">Action required</th><th className="px-3 py-2 text-left">Responsible person</th><th className="px-3 py-2 text-left">Target date</th><th className="px-3 py-2 text-left">Resources required</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Completion date</th><th className="px-3 py-2 text-left">DMS docs</th><th className="px-3 py-2 text-left">Evidence</th><th className="px-3 py-2 text-left">Updates log</th><th className="px-3 py-2 text-right">Row</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 align-top">
              {items.map((item, index) => (
                <tr key={item.id ?? `new-${index}`}>
                  <td className="px-3 py-2 min-w-[180px]"><textarea rows={3} value={item.reviewItem} onChange={(e) => updateItem(index, { reviewItem: e.target.value })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded" /></td>
                  <td className="px-3 py-2 min-w-[180px]"><textarea rows={3} value={item.discussionNotes} onChange={(e) => updateItem(index, { discussionNotes: e.target.value })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded" /></td>
                  <td className="px-3 py-2 min-w-[180px]"><textarea rows={3} value={item.actionRequired} onChange={(e) => updateItem(index, { actionRequired: e.target.value })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded" /></td>
                  <td className="px-3 py-2 min-w-[220px] space-y-1">
                    <select value={item.responsibleUserId} onChange={(e) => updateItem(index, { responsibleUserId: e.target.value as UUID | '' })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded">
                      <option value="">Select user</option>{memberOptions.map((opt) => <option key={opt.userId} value={opt.userId}>{opt.label}</option>)}
                    </select>
                    <input value={item.externalResponsibleName} onChange={(e) => updateItem(index, { externalResponsibleName: e.target.value })} disabled={!canEditItem(item)} placeholder="Or external person" className="w-full px-2 py-1 border border-surface-300 rounded" />
                  </td>
                  <td className="px-3 py-2"><input type="date" value={item.targetDate} onChange={(e) => updateItem(index, { targetDate: e.target.value })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded" /></td>
                  <td className="px-3 py-2 min-w-[180px]"><textarea rows={2} value={item.resourcesRequired} onChange={(e) => updateItem(index, { resourcesRequired: e.target.value })} disabled={!canEditItem(item)} className="w-full px-2 py-1 border border-surface-300 rounded" /></td>
                  <td className="px-3 py-2"><select value={item.status} onChange={(e) => updateItem(index, { status: e.target.value as ReviewMeetingItemStatus, ...(e.target.value === 'COMPLETED' ? {} : { completionDate: '' }) })} disabled={!canUpdateItemProgress(item)} className="w-full px-2 py-1 border border-surface-300 rounded">{ITEM_STATUS_OPTIONS.map((statusValue) => <option key={statusValue} value={statusValue}>{statusValue}</option>)}</select></td>
                  <td className="px-3 py-2">
                    {item.status === 'COMPLETED' ? (
                      <input type="date" value={item.completionDate} onChange={(e) => updateItem(index, { completionDate: e.target.value })} disabled={!canUpdateItemProgress(item)} className="w-full px-2 py-1 border border-surface-300 rounded" />
                    ) : (
                      <span className="text-xs text-charcoal-400">Only required when completed</span>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[190px] max-w-[190px]">
                    <div className="max-h-24 overflow-auto space-y-1">
                      {(documents ?? []).slice(0, 20).map((doc) => (
                        <label key={doc.id} className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={item.linkedDocumentIds.includes(doc.id)} disabled={!canEditItem(item)} onChange={(e) => e.target.checked ? updateItem(index, { linkedDocumentIds: [...item.linkedDocumentIds, doc.id] }) : updateItem(index, { linkedDocumentIds: item.linkedDocumentIds.filter((id) => id !== doc.id) })} />
                          <span className="truncate">{doc.title}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 min-w-[160px]">
                    <p className="text-xs text-charcoal-500">Files: {item.evidenceFileIds.length}</p>
                    <input type="file" disabled={!canEditItem(item) || !item.id} onChange={(e) => void handleUploadEvidence(index, e.target.files?.[0] ?? null)} className="mt-1 text-xs" />
                    {!item.id && <p className="text-[11px] text-charcoal-400 mt-1">Save meeting first</p>}
                  </td>
                  <td className="px-3 py-2 min-w-[230px]">
                    <div className="space-y-1 max-h-24 overflow-auto mb-1">
                      {item.updatesLog.map((entry, updateIndex) => <p key={`${entry.timestamp}-${updateIndex}`} className="text-xs bg-surface-50 rounded p-1"><strong>{new Date(entry.timestamp).toLocaleString()}:</strong> {entry.note}</p>)}
                    </div>
                    <textarea rows={2} value={item.draftUpdateNote} disabled={!canUpdateItemProgress(item)} onChange={(e) => updateItem(index, { draftUpdateNote: e.target.value })} className="w-full px-2 py-1 border border-surface-300 rounded" placeholder="Add timestamped update" />
                    {canEdit && (
                      <button type="button" disabled={!canEditItem(item) || !item.draftUpdateNote.trim()} onClick={() => updateItem(index, { updatesLog: [{ timestamp: new Date().toISOString(), note: item.draftUpdateNote.trim(), userId: (user?.id as UUID) ?? null }, ...item.updatesLog], draftUpdateNote: '' })} className="mt-1 px-2 py-1 text-xs border border-surface-300 rounded">Add Update</button>
                    )}
                    {!canEdit && item.id && canUpdateItemProgress(item) && (
                      <button type="button" disabled={itemSavingIndex === index} onClick={() => void handleSaveItem(index)} className="mt-1 px-2 py-1 text-xs border border-surface-300 rounded disabled:opacity-60">{itemSavingIndex === index ? 'Saving...' : 'Save Item'}</button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => removeItem(index)} disabled={!canEdit || items.length <= 1} className="px-2 py-1 text-xs border border-critical/40 text-critical rounded disabled:opacity-40">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

