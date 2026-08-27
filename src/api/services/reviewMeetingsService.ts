import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyMembership, ReviewMeeting, ReviewMeetingItem, ReviewMeetingItemStatus, UUID } from '../models/entities';
import type { CompanyRole } from '../models/core';
import { createActivityLog } from './activityLogService';
import { createNotification } from './notificationsService';
import { sendEmail } from './emailService';
import { listUserProfiles } from './profilesService';
import { createTask } from './tasksService';

export type ReviewMeetingFilters = {
  year?: number;
  status?: ReviewMeeting['status'] | 'ALL';
  timing?: 'all' | 'upcoming' | 'overdue';
  dateFrom?: string;
  dateTo?: string;
  responsibleUserId?: UUID;
  progressStatus?: ReviewMeetingItemStatus | 'ALL';
};

export type ReviewMeetingItemInput = {
  id?: UUID;
  reviewItem: string;
  discussionNotes?: string;
  actionRequired: string;
  responsibleUserId?: UUID | null;
  externalResponsibleName?: string | null;
  targetDate?: string | null;
  resourcesRequired?: string | null;
  status: ReviewMeetingItemStatus;
  completionDate?: string | null;
  evidenceFileIds?: UUID[];
  linkedDocumentIds?: UUID[];
  updatesLog?: Array<{ timestamp: string; note: string; userId: UUID | null }>;
  linkedTaskId?: UUID | null;
};

export type ReviewMeetingInput = {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole;
  title?: string | null;
  date: string;
  time: string;
  place: string;
  attendeeUserIds: UUID[];
  externalAttendees: string[];
  emailList: string[];
  nextMeetingDate?: string | null;
  chairpersonUserId?: UUID | null;
  ceoApprovalRequired?: boolean;
  status?: ReviewMeeting['status'];
  siteId?: UUID | null;
  departmentId?: UUID | null;
  autoEmailOnCreate?: boolean;
  autoEmailOnUpdate?: boolean;
  autoCreateTasksFromItems?: boolean;
  items: ReviewMeetingItemInput[];
};

export type ReviewMeetingViewer = {
  userId: UUID;
  role: CompanyRole;
  membership?: CompanyMembership | null;
  email?: string | null;
};

export type ReviewMeetingWithItems = {
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function toDbItem(companyId: UUID, meetingId: UUID, item: ReviewMeetingItemInput): Record<string, unknown> {
  return {
    company_id: companyId,
    meeting_id: meetingId,
    review_item: item.reviewItem.trim(),
    discussion_notes: item.discussionNotes?.trim() || null,
    action_required: item.actionRequired.trim(),
    responsible_user_id: item.responsibleUserId ?? null,
    responsible_name_external: item.externalResponsibleName?.trim() || null,
    target_date: item.targetDate || null,
    resources_required: item.resourcesRequired?.trim() || null,
    status: item.status,
    completion_date: item.status === 'COMPLETED' ? item.completionDate || new Date().toISOString() : null,
    evidence_file_ids: item.evidenceFileIds?.length ? item.evidenceFileIds : null,
    linked_document_ids: item.linkedDocumentIds?.length ? item.linkedDocumentIds : null,
    linked_task_id: item.linkedTaskId ?? null,
    updates_log: (item.updatesLog ?? []).map((u) => ({ timestamp: u.timestamp, note: u.note, user_id: u.userId }))
  };
}

function hasResponsibleAssignment(items: ReviewMeetingItem[], userId: UUID): boolean {
  return items.some((item) => item.responsible_user_id === userId);
}

function canManageReviewMeetings(role: CompanyRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

export function canSignReviewMeeting(params: {
  meeting: ReviewMeeting;
  viewer: ReviewMeetingViewer;
}): boolean {
  const { meeting, viewer } = params;
  if (meeting.signature_status === 'SIGNED') return false;
  const isChairperson = !!meeting.chairperson_user_id && meeting.chairperson_user_id === viewer.userId;
  if (!isChairperson) return false;
  return viewer.role === 'owner' || viewer.role === 'admin' || viewer.role === 'manager' || viewer.role === 'supervisor';
}

export function canEditReviewMeetingItem(params: {
  meeting: ReviewMeeting;
  item: ReviewMeetingItem;
  viewer: ReviewMeetingViewer;
}): boolean {
  const { meeting, item, viewer } = params;
  if (meeting.is_locked) return false;
  if (canManageReviewMeetings(viewer.role)) return true;
  if (viewer.role === 'employee') return item.responsible_user_id === viewer.userId;
  return false;
}

export function canViewReviewMeeting(params: {
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  viewer: ReviewMeetingViewer;
}): boolean {
  const { meeting, items, viewer } = params;
  const role = viewer.role;
  if (role === 'owner' || role === 'admin' || role === 'manager') return true;

  if (role === 'supervisor') {
    const isAssigned = hasResponsibleAssignment(items, viewer.userId);
    const scoped = !!viewer.membership && (
      (!!viewer.membership.department_id && viewer.membership.department_id === meeting.department_id) ||
      (!!viewer.membership.site_id && viewer.membership.site_id === meeting.site_id)
    );
    if (scoped || isAssigned) return true;
    if (!meeting.department_id && !meeting.site_id) return true;
    return false;
  }

  if (role === 'employee') {
    const isAttendee = (meeting.attendee_user_ids ?? []).includes(viewer.userId);
    return isAttendee || hasResponsibleAssignment(items, viewer.userId);
  }

  if (role === 'consultant' || role === 'auditor') {
    const isAttendee = (meeting.attendee_user_ids ?? []).includes(viewer.userId);
    const receivesEmail = !!viewer.email && (meeting.email_list ?? []).map((e) => e.toLowerCase()).includes(viewer.email.toLowerCase());
    return isAttendee || receivesEmail || hasResponsibleAssignment(items, viewer.userId);
  }

  return false;
}

export function canEditReviewMeeting(params: {
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  viewer: ReviewMeetingViewer;
}): boolean {
  const { meeting, items, viewer } = params;
  if (meeting.is_locked) return false;
  if (viewer.role === 'owner' || viewer.role === 'admin' || viewer.role === 'manager') return true;
  if (viewer.role === 'supervisor') {
    return hasResponsibleAssignment(items, viewer.userId) || meeting.created_by_user_id === viewer.userId;
  }
  return false;
}

export async function listReviewMeetings(input: {
  companyId: UUID;
  viewer?: ReviewMeetingViewer;
  filters?: ReviewMeetingFilters;
}): Promise<Array<ReviewMeetingWithItems>> {
  let q = insforge.database
    .from('review_meetings')
    .select('*')
    .eq('company_id', input.companyId)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(500);

  if (input.filters?.year) {
    q = q.gte('date', `${input.filters.year}-01-01`).lte('date', `${input.filters.year}-12-31`);
  }
  if (input.filters?.dateFrom) {
    q = q.gte('date', input.filters.dateFrom);
  }
  if (input.filters?.dateTo) {
    q = q.lte('date', input.filters.dateTo);
  }
  if (input.filters?.status && input.filters.status !== 'ALL') {
    q = q.eq('status', input.filters.status);
  }

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const meetings = (data ?? []) as ReviewMeeting[];

  const meetingIds = meetings.map((m) => m.id);
  const items = meetingIds.length ? await listReviewMeetingItems(input.companyId, meetingIds) : [];
  const itemsByMeeting = new Map<UUID, ReviewMeetingItem[]>();
  for (const item of items) {
    const bucket = itemsByMeeting.get(item.meeting_id) ?? [];
    bucket.push(item);
    itemsByMeeting.set(item.meeting_id, bucket);
  }

  let out = meetings.map((meeting) => ({ meeting, items: itemsByMeeting.get(meeting.id) ?? [] }));

  if (input.filters?.timing && input.filters.timing !== 'all') {
    const now = new Date();
    out = out.filter(({ meeting }) => {
      const dt = new Date(`${meeting.date}T${meeting.time}`);
      if (input.filters?.timing === 'upcoming') return dt.getTime() >= now.getTime();
      if (input.filters?.timing === 'overdue') {
        const hasOpenItems = (itemsByMeeting.get(meeting.id) ?? []).some((i) => i.status !== 'COMPLETED' && !!i.target_date && new Date(i.target_date).getTime() < now.getTime());
        return hasOpenItems;
      }
      return true;
    });
  }

  if (input.filters?.responsibleUserId) {
    out = out.filter(({ items: rows }) => rows.some((item) => item.responsible_user_id === input.filters?.responsibleUserId));
  }
  if (input.filters?.progressStatus && input.filters.progressStatus !== 'ALL') {
    out = out.filter(({ items: rows }) => rows.some((item) => item.status === input.filters?.progressStatus));
  }

  if (!input.viewer) return out;
  return out.filter((entry) => canViewReviewMeeting({ meeting: entry.meeting, items: entry.items, viewer: input.viewer! }));
}

export async function listReviewMeetingItems(companyId: UUID, meetingIds: UUID[]): Promise<ReviewMeetingItem[]> {
  const { data, error } = await insforge.database
    .from('review_meeting_items')
    .select('*')
    .eq('company_id', companyId)
    .in('meeting_id', meetingIds)
    .order('created_at', { ascending: true });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ReviewMeetingItem[];
}

export async function getReviewMeeting(companyId: UUID, meetingId: UUID): Promise<ReviewMeetingWithItems | null> {
  const { data, error } = await insforge.database
    .from('review_meetings')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', meetingId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) return null;

  const items = await listReviewMeetingItems(companyId, [meetingId]);
  return { meeting: data as ReviewMeeting, items };
}

async function createTasksFromItems(input: {
  companyId: UUID;
  actorUserId: UUID;
  meetingId: UUID;
  items: ReviewMeetingItem[];
}): Promise<void> {
  for (const item of input.items) {
    if (!item.responsible_user_id || !item.target_date || item.linked_task_id) continue;
    try {
      const task = await createTask({
        companyId: input.companyId,
        module: 'general',
        title: `Management review action: ${item.review_item}`,
        description: item.action_required,
        category: 'quality_action',
        riskLevel: 'medium',
        priority: 'medium',
        dueAt: item.target_date,
        assigneeUserId: item.responsible_user_id,
        sourceEntityType: 'review_meeting_item',
        sourceEntityId: item.id,
        createdByUserId: input.actorUserId
      });

      await insforge.database
        .from('review_meeting_items')
        .update({ linked_task_id: task.id, updated_at: new Date().toISOString() })
        .eq('company_id', input.companyId)
        .eq('id', item.id);
    } catch {
      // Ignore task creation failures for individual items to avoid blocking meeting save.
    }
  }
}

async function sendMeetingNotifications(input: {
  companyId: UUID;
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  trigger: 'created' | 'updated' | 'signed' | 'next_meeting_reminder' | 'action_reminder' | 'action_overdue';
  customMessage?: string;
}): Promise<void> {
  const attendeeUserIds = input.meeting.attendee_user_ids ?? [];
  const responsibleUserIds = input.items.map((i) => i.responsible_user_id).filter(Boolean) as UUID[];
  const notifyUserIds = [...new Set([...attendeeUserIds, ...responsibleUserIds])];

  let title = 'Management Review Meeting';
  let message = input.customMessage ?? `Review meeting on ${input.meeting.date} at ${input.meeting.time} (${input.meeting.place}).`;
  let severity: 'info' | 'warning' | 'success' | 'error' = 'info';

  if (input.trigger === 'signed') {
    title = 'Meeting Minutes Signed';
    message = input.customMessage ?? `Minutes were signed for the review meeting on ${input.meeting.date}.`;
    severity = 'success';
  } else if (input.trigger === 'action_overdue') {
    title = 'Overdue Review Action';
    severity = 'warning';
  } else if (input.trigger === 'next_meeting_reminder') {
    title = 'Upcoming Management Review Meeting';
  }

  await Promise.all(
    notifyUserIds.map((userId) =>
      createNotification(
        input.companyId,
        userId,
        severity,
        title,
        message,
        {
          entityType: 'review_meeting',
          meetingId: input.meeting.id,
          trigger: input.trigger
        }
      ).catch(() => undefined)
    )
  );

  const profiles = await listUserProfiles(input.companyId).catch(() => []);
  const emailMap = new Map(profiles.map((p) => [p.user_id, p.email]));
  const attendeeEmails = attendeeUserIds
    .map((id) => emailMap.get(id))
    .filter((v): v is string => !!v)
    .map(normalizeEmail);

  const recipients = dedupeStrings([...(input.meeting.email_list ?? []), ...attendeeEmails]);
  if (!recipients.length) return;

  const html = `
    <h2>${title}</h2>
    <p>${message}</p>
    <p><strong>Date:</strong> ${input.meeting.date}</p>
    <p><strong>Time:</strong> ${input.meeting.time}</p>
    <p><strong>Place:</strong> ${input.meeting.place}</p>
  `;

  await sendEmail({
    to: recipients,
    subject: title,
    html,
    text: `${title}\n${message}`
  }).catch(() => undefined);
}

function statusSummary(items: ReviewMeetingItem[]): { outstanding: number; inProgress: number; completed: number } {
  return {
    outstanding: items.filter((i) => i.status === 'OUTSTANDING').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length
  };
}

export async function buildReviewMeetingReport(input: {
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  companyName?: string;
  attendeeLabels?: string[];
}): Promise<{ html: string; csv: Blob }> {
  const summary = statusSummary(input.items);
  const attendeeList = [...(input.attendeeLabels ?? []), ...(input.meeting.external_attendees ?? [])];
  const itemRows = input.items
    .map(
      (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.review_item)}</td>
        <td>${escapeHtml(item.action_required)}</td>
        <td>${escapeHtml(item.responsible_name_external ?? item.responsible_user_id ?? '—')}</td>
        <td>${escapeHtml(item.target_date ?? '—')}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.completion_date ?? '—')}</td>
      </tr>`
    )
    .join('');

  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Management Review Meeting Summary</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1f2937; line-height: 1.45; }
        h1, h2 { margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; }
        .meta { margin-bottom: 12px; }
        .meta p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(input.meeting.title ?? 'Management Review Meeting')}</h1>
      <div class="meta">
        <p><strong>Date:</strong> ${escapeHtml(input.meeting.date)}</p>
        <p><strong>Time:</strong> ${escapeHtml(input.meeting.time)}</p>
        <p><strong>Place:</strong> ${escapeHtml(input.meeting.place)}</p>
        <p><strong>Attendees:</strong> ${escapeHtml(attendeeList.join(', ') || '—')}</p>
      </div>
      <h2>Action Items</h2>
      <table>
        <thead>
          <tr><th>#</th><th>Review item/topic</th><th>Action required</th><th>Responsible</th><th>Target date</th><th>Status</th><th>Completion date</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <h2>Status Summary</h2>
      <p>Outstanding: ${summary.outstanding} | In progress: ${summary.inProgress} | Completed: ${summary.completed}</p>
      <p><strong>Next meeting date:</strong> ${escapeHtml(input.meeting.next_meeting_date ?? '—')}</p>
      <p><strong>Signature:</strong> ${input.meeting.signature_status} ${input.meeting.signed_at ? `(${escapeHtml(input.meeting.signed_at)})` : ''}</p>
      <p><small>Generated ${new Date().toLocaleString()}</small></p>
    </body>
    </html>
  `;

  const csvRows = [
    'Review Item,Action Required,Responsible,Target Date,Status,Completion Date',
    ...input.items.map((item) => {
      const cells = [
        item.review_item,
        item.action_required,
        item.responsible_name_external ?? item.responsible_user_id ?? '',
        item.target_date ?? '',
        item.status,
        item.completion_date ?? ''
      ];
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
    })
  ].join('\n');

  return {
    html,
    csv: new Blob([csvRows], { type: 'text/csv;charset=utf-8;' })
  };
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function emailReviewMeetingReport(input: {
  companyId: UUID;
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  attendeeLabels?: string[];
}): Promise<void> {
  const recipients = dedupeStrings(input.meeting.email_list ?? []).map(normalizeEmail);
  if (!recipients.length) return;
  const report = await buildReviewMeetingReport({
    meeting: input.meeting,
    items: input.items,
    attendeeLabels: input.attendeeLabels
  });

  await sendEmail({
    to: recipients,
    subject: `Management Review Meeting Report - ${input.meeting.date}`,
    html: report.html,
    text: `Management Review Meeting report for ${input.meeting.date}`
  });
}

export async function generateReviewMeetingReport(input: {
  companyId: UUID;
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  actorUserId: UUID;
  attendeeLabels?: string[];
}): Promise<{ html: string; csv: Blob }> {
  const report = await buildReviewMeetingReport({
    meeting: input.meeting,
    items: input.items,
    attendeeLabels: input.attendeeLabels
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.report_generated',
    entityType: 'review_meeting',
    entityId: input.meeting.id
  });
  return report;
}

export async function emailReviewMeetingReportWithAudit(input: {
  companyId: UUID;
  meeting: ReviewMeeting;
  items: ReviewMeetingItem[];
  actorUserId: UUID;
  attendeeLabels?: string[];
  reason?: 'manual' | 'create' | 'update' | 'signed';
}): Promise<void> {
  await emailReviewMeetingReport({
    companyId: input.companyId,
    meeting: input.meeting,
    items: input.items,
    attendeeLabels: input.attendeeLabels
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.report_emailed',
    entityType: 'review_meeting',
    entityId: input.meeting.id,
    metadata: { reason: input.reason ?? 'manual' }
  });
}

export async function createReviewMeeting(input: ReviewMeetingInput): Promise<ReviewMeetingWithItems> {
  if (!canManageReviewMeetings(input.actorRole)) {
    throw new Error('Only owner/admin/manager/supervisor can create review meetings.');
  }
  if (!input.items.length) throw new Error('At least one review item is required.');
  const payload = {
    company_id: input.companyId,
    title: input.title?.trim() || 'Management Review Meeting',
    date: input.date,
    time: input.time,
    place: input.place.trim(),
    attendee_user_ids: input.attendeeUserIds,
    external_attendees: dedupeStrings(input.externalAttendees),
    email_list: dedupeStrings(input.emailList.map(normalizeEmail)),
    next_meeting_date: input.nextMeetingDate || null,
    chairperson_user_id: input.chairpersonUserId ?? null,
    ceo_approval_required: !!input.ceoApprovalRequired,
    status: input.status ?? 'DRAFT',
    signature_status: 'NOT_SIGNED',
    is_locked: false,
    auto_email_on_create: input.autoEmailOnCreate ?? true,
    auto_email_on_update: input.autoEmailOnUpdate ?? false,
    auto_create_tasks_from_items: input.autoCreateTasksFromItems ?? false,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    created_by_user_id: input.actorUserId
  };

  const { data, error } = await insforge.database
    .from('review_meetings')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create review meeting.');
  const meeting = data as ReviewMeeting;

  const itemPayload = input.items.map((item) => toDbItem(input.companyId, meeting.id, item));
  const { data: createdItems, error: itemsError } = await insforge.database
    .from('review_meeting_items')
    .insert(itemPayload)
    .select('*');
  if (itemsError) throw new Error(getErrorMessage(itemsError));
  const items = (createdItems ?? []) as ReviewMeetingItem[];

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.create',
    entityType: 'review_meeting',
    entityId: meeting.id,
    metadata: { itemCount: items.length }
  });

  if (meeting.auto_create_tasks_from_items) {
    await createTasksFromItems({ companyId: input.companyId, actorUserId: input.actorUserId, meetingId: meeting.id, items });
  }

  await sendMeetingNotifications({ companyId: input.companyId, meeting, items, trigger: 'created' });

  if (meeting.auto_email_on_create) {
    await emailReviewMeetingReportWithAudit({
      companyId: input.companyId,
      meeting,
      items,
      actorUserId: input.actorUserId,
      reason: 'create'
    }).catch(() => undefined);
  }

  return { meeting, items };
}

export async function updateReviewMeeting(input: ReviewMeetingInput & { meetingId: UUID }): Promise<ReviewMeetingWithItems> {
  if (!canManageReviewMeetings(input.actorRole)) {
    throw new Error('Only owner/admin/manager/supervisor can update review meetings.');
  }
  const existing = await getReviewMeeting(input.companyId, input.meetingId);
  if (!existing) throw new Error('Review meeting not found.');
  if (existing.meeting.is_locked) {
    throw new Error('Meeting minutes are signed and locked.');
  }

  const updatePayload = {
    title: input.title?.trim() || existing.meeting.title,
    date: input.date,
    time: input.time,
    place: input.place.trim(),
    attendee_user_ids: input.attendeeUserIds,
    external_attendees: dedupeStrings(input.externalAttendees),
    email_list: dedupeStrings(input.emailList.map(normalizeEmail)),
    next_meeting_date: input.nextMeetingDate || null,
    chairperson_user_id: input.chairpersonUserId ?? null,
    ceo_approval_required: !!input.ceoApprovalRequired,
    status: input.status ?? existing.meeting.status,
    auto_email_on_create: input.autoEmailOnCreate ?? existing.meeting.auto_email_on_create,
    auto_email_on_update: input.autoEmailOnUpdate ?? existing.meeting.auto_email_on_update,
    auto_create_tasks_from_items: input.autoCreateTasksFromItems ?? existing.meeting.auto_create_tasks_from_items,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    updated_at: new Date().toISOString()
  };

  const { data: updatedMeetingRow, error: updateMeetingError } = await insforge.database
    .from('review_meetings')
    .update(updatePayload)
    .eq('company_id', input.companyId)
    .eq('id', input.meetingId)
    .select('*')
    .single();

  if (updateMeetingError) throw new Error(getErrorMessage(updateMeetingError));
  const updatedMeeting = updatedMeetingRow as ReviewMeeting;

  const existingById = new Map(existing.items.map((item) => [item.id, item]));
  const inputIds = new Set(input.items.map((item) => item.id).filter(Boolean) as UUID[]);

  for (const item of existing.items) {
    if (!inputIds.has(item.id)) {
      await insforge.database
        .from('review_meeting_items')
        .delete()
        .eq('company_id', input.companyId)
        .eq('id', item.id);
    }
  }

  for (const item of input.items) {
    if (item.id && existingById.has(item.id)) {
      const prev = existingById.get(item.id)!;
      const { error: itemUpdateError } = await insforge.database
        .from('review_meeting_items')
        .update({ ...toDbItem(input.companyId, input.meetingId, item), updated_at: new Date().toISOString() })
        .eq('company_id', input.companyId)
        .eq('id', item.id);
      if (itemUpdateError) throw new Error(getErrorMessage(itemUpdateError));

      if (prev.status !== item.status) {
        await createActivityLog({
          companyId: input.companyId,
          actorUserId: input.actorUserId,
          action: 'review_meeting_items.status_changed',
          entityType: 'review_meeting_item',
          entityId: item.id,
          metadata: { from: prev.status, to: item.status }
        });
      }
    } else {
      const { error: insertItemError } = await insforge.database
        .from('review_meeting_items')
        .insert(toDbItem(input.companyId, input.meetingId, item));
      if (insertItemError) throw new Error(getErrorMessage(insertItemError));
    }
  }

  const refreshed = await getReviewMeeting(input.companyId, input.meetingId);
  if (!refreshed) throw new Error('Review meeting not found after update.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.update',
    entityType: 'review_meeting',
    entityId: input.meetingId,
    metadata: { itemCount: refreshed.items.length }
  });

  await sendMeetingNotifications({
    companyId: input.companyId,
    meeting: refreshed.meeting,
    items: refreshed.items,
    trigger: 'updated'
  });

  if (refreshed.meeting.auto_email_on_update) {
    await emailReviewMeetingReportWithAudit({
      companyId: input.companyId,
      meeting: refreshed.meeting,
      items: refreshed.items,
      actorUserId: input.actorUserId,
      reason: 'update'
    }).catch(() => undefined);
  }

  if (refreshed.meeting.auto_create_tasks_from_items) {
    await createTasksFromItems({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      meetingId: refreshed.meeting.id,
      items: refreshed.items
    });
  }

  return refreshed;
}

export async function updateReviewMeetingItem(input: {
  companyId: UUID;
  meetingId: UUID;
  itemId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole;
  patch: Partial<ReviewMeetingItemInput> & { updateNote?: string };
}): Promise<ReviewMeetingItem> {
  const existing = await getReviewMeeting(input.companyId, input.meetingId);
  if (!existing) throw new Error('Review meeting not found.');
  const item = existing.items.find((row) => row.id === input.itemId);
  if (!item) throw new Error('Review meeting item not found.');

  const viewer: ReviewMeetingViewer = {
    userId: input.actorUserId,
    role: input.actorRole
  };
  if (!canEditReviewMeetingItem({ meeting: existing.meeting, item, viewer })) {
    throw new Error('You do not have permission to update this item.');
  }
  if (input.actorRole === 'employee') {
    const disallowed = ['reviewItem', 'discussionNotes', 'actionRequired', 'responsibleUserId', 'externalResponsibleName', 'targetDate', 'resourcesRequired', 'evidenceFileIds', 'linkedDocumentIds', 'linkedTaskId']
      .some((field) => Object.prototype.hasOwnProperty.call(input.patch, field));
    if (disallowed) {
      throw new Error('Employees can only update progress status, completion date, and update notes.');
    }
  }

  const nextStatus = input.patch.status ?? item.status;
  const nextCompletionDate =
    nextStatus === 'COMPLETED'
      ? input.patch.completionDate ?? item.completion_date ?? new Date().toISOString().slice(0, 10)
      : null;
  if (nextStatus === 'COMPLETED' && !nextCompletionDate) {
    throw new Error('Completion date is required when status is COMPLETED.');
  }

  const prevLog = (item.updates_log ?? []).map((entry) => ({
    timestamp: String(entry.timestamp),
    note: String(entry.note),
    user_id: entry.user_id ?? null
  }));
  const updateNote = input.patch.updateNote?.trim();
  if (updateNote) {
    prevLog.unshift({
      timestamp: new Date().toISOString(),
      note: updateNote,
      user_id: input.actorUserId
    });
  }

  const payload: Record<string, unknown> = {
    review_item: input.patch.reviewItem?.trim() ?? item.review_item,
    discussion_notes: input.patch.discussionNotes?.trim() ?? item.discussion_notes,
    action_required: input.patch.actionRequired?.trim() ?? item.action_required,
    responsible_user_id:
      Object.prototype.hasOwnProperty.call(input.patch, 'responsibleUserId')
        ? input.patch.responsibleUserId ?? null
        : item.responsible_user_id,
    responsible_name_external:
      Object.prototype.hasOwnProperty.call(input.patch, 'externalResponsibleName')
        ? input.patch.externalResponsibleName?.trim() || null
        : item.responsible_name_external,
    target_date: Object.prototype.hasOwnProperty.call(input.patch, 'targetDate') ? input.patch.targetDate ?? null : item.target_date,
    resources_required:
      Object.prototype.hasOwnProperty.call(input.patch, 'resourcesRequired')
        ? input.patch.resourcesRequired?.trim() || null
        : item.resources_required,
    status: nextStatus,
    completion_date: nextCompletionDate,
    evidence_file_ids:
      Object.prototype.hasOwnProperty.call(input.patch, 'evidenceFileIds') ? input.patch.evidenceFileIds ?? null : item.evidence_file_ids,
    linked_document_ids:
      Object.prototype.hasOwnProperty.call(input.patch, 'linkedDocumentIds')
        ? input.patch.linkedDocumentIds ?? null
        : item.linked_document_ids,
    linked_task_id:
      Object.prototype.hasOwnProperty.call(input.patch, 'linkedTaskId') ? input.patch.linkedTaskId ?? null : item.linked_task_id,
    updates_log: prevLog,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await insforge.database
    .from('review_meeting_items')
    .update(payload)
    .eq('company_id', input.companyId)
    .eq('meeting_id', input.meetingId)
    .eq('id', input.itemId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  const updated = data as ReviewMeetingItem;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meeting_items.update',
    entityType: 'review_meeting_item',
    entityId: input.itemId,
    metadata: {
      meetingId: input.meetingId,
      statusFrom: item.status,
      statusTo: updated.status
    }
  });
  return updated;
}

export async function deleteReviewMeeting(input: {
  companyId: UUID;
  meetingId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  await insforge.database
    .from('review_meeting_items')
    .delete()
    .eq('company_id', input.companyId)
    .eq('meeting_id', input.meetingId);

  const { error } = await insforge.database
    .from('review_meetings')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.meetingId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.delete',
    entityType: 'review_meeting',
    entityId: input.meetingId
  });
}

export async function signReviewMeeting(input: {
  companyId: UUID;
  meetingId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole;
  confirmationText: string;
}): Promise<ReviewMeetingWithItems> {
  if (input.confirmationText.trim().toUpperCase() !== 'SIGN') {
    throw new Error('Signature confirmation failed. Type SIGN to confirm.');
  }

  const existing = await getReviewMeeting(input.companyId, input.meetingId);
  if (!existing) throw new Error('Review meeting not found.');
  if (!canSignReviewMeeting({ meeting: existing.meeting, viewer: { userId: input.actorUserId, role: input.actorRole } })) {
    throw new Error('Only the assigned chairperson/CEO can sign this meeting.');
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('review_meetings')
    .update({
      signature_status: 'SIGNED',
      signed_by_user_id: input.actorUserId,
      signed_at: nowIso,
      status: 'SIGNED',
      is_locked: true,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.meetingId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  const meeting = data as ReviewMeeting;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.signed',
    entityType: 'review_meeting',
    entityId: input.meetingId,
    metadata: { signedAt: nowIso }
  });

  await generateReviewMeetingReport({
    companyId: input.companyId,
    meeting,
    items: existing.items,
    actorUserId: input.actorUserId
  });
  await emailReviewMeetingReportWithAudit({
    companyId: input.companyId,
    meeting,
    items: existing.items,
    actorUserId: input.actorUserId,
    reason: 'signed'
  }).catch(() => undefined);

  await sendMeetingNotifications({ companyId: input.companyId, meeting, items: existing.items, trigger: 'signed' });

  return { meeting, items: existing.items };
}

export async function unlockSignedReviewMeeting(input: {
  companyId: UUID;
  meetingId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole;
  reason?: string;
}): Promise<ReviewMeetingWithItems> {
  if (!['owner', 'admin'].includes(input.actorRole)) {
    throw new Error('Only owner/admin can unlock signed meetings.');
  }

  const { data, error } = await insforge.database
    .from('review_meetings')
    .update({ is_locked: false, status: 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.meetingId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  const meeting = data as ReviewMeeting;
  const items = await listReviewMeetingItems(input.companyId, [input.meetingId]);

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'review_meetings.unlocked',
    entityType: 'review_meeting',
    entityId: input.meetingId,
    metadata: { reason: input.reason ?? null }
  });

  return { meeting, items };
}

export async function listReviewActionItems(input: {
  companyId: UUID;
  viewer?: ReviewMeetingViewer;
  status?: ReviewMeetingItemStatus | 'ALL';
  responsibleUserId?: UUID;
  from?: string;
  to?: string;
}): Promise<Array<ReviewMeetingItem & { meeting: ReviewMeeting }>> {
  const meetings = await listReviewMeetings({ companyId: input.companyId, viewer: input.viewer });
  const meetingMap = new Map(meetings.map((m) => [m.meeting.id, m.meeting]));
  const ids = [...meetingMap.keys()];
  if (!ids.length) return [];

  let q = insforge.database
    .from('review_meeting_items')
    .select('*')
    .eq('company_id', input.companyId)
    .in('meeting_id', ids)
    .order('target_date', { ascending: true })
    .limit(2000);

  if (input.status && input.status !== 'ALL') q = q.eq('status', input.status);
  if (input.responsibleUserId) q = q.eq('responsible_user_id', input.responsibleUserId);
  if (input.from) q = q.gte('target_date', input.from);
  if (input.to) q = q.lte('target_date', input.to);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));

  return ((data ?? []) as ReviewMeetingItem[])
    .map((item) => ({ ...item, meeting: meetingMap.get(item.meeting_id)! }))
    .filter((item) => !!item.meeting);
}

const OVERDUE_ADMIN_ESCALATION_DAYS = 3;

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

async function listRoleUserIds(companyId: UUID, roles: CompanyRole[]): Promise<UUID[]> {
  const { data } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', roles);
  return (data ?? []).map((row: any) => row.user_id as UUID);
}

async function wasReminderSent(input: {
  companyId: UUID;
  meetingId: UUID;
  itemId?: UUID;
  reminderType: string;
}): Promise<boolean> {
  const query = insforge.database
    .from('review_meeting_reminder_events')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('meeting_id', input.meetingId)
    .eq('reminder_type', input.reminderType);

  const { data } = input.itemId
    ? await query.eq('meeting_item_id', input.itemId).maybeSingle()
    : await query.is('meeting_item_id', null).maybeSingle();

  return !!data;
}

async function markReminderSent(input: {
  companyId: UUID;
  meetingId: UUID;
  itemId?: UUID;
  reminderType: string;
}): Promise<void> {
  await insforge.database
    .from('review_meeting_reminder_events')
    .insert({
      company_id: input.companyId,
      meeting_id: input.meetingId,
      meeting_item_id: input.itemId ?? null,
      reminder_type: input.reminderType
    });
}

async function listSupervisorForUser(companyId: UUID, userId: UUID): Promise<UUID | null> {
  const { data } = await insforge.database
    .from('user_profiles')
    .select('supervisor_user_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.supervisor_user_id as UUID | null) ?? null;
}

export async function runReviewMeetingReminderJobs(companyId: UUID): Promise<void> {
  const all = await listReviewMeetings({ companyId });
  const now = new Date();
  const managerAndSupervisors = await listRoleUserIds(companyId, ['manager', 'supervisor']);
  const adminOwners = await listRoleUserIds(companyId, ['owner', 'admin']);

  for (const { meeting, items } of all) {
    if (meeting.next_meeting_date) {
      const days = daysBetween(now, new Date(meeting.next_meeting_date));
      const isMorningOf = days === 0 && now.getHours() < 12;
      if (days === 7 || days === 1 || isMorningOf) {
        const reminderType = isMorningOf ? 'meeting_0d_morning' : `meeting_${days}d`;
        const sent = await wasReminderSent({
          companyId,
          meetingId: meeting.id,
          reminderType
        });
        if (!sent) {
          await sendMeetingNotifications({
            companyId,
            meeting,
            items,
            trigger: 'next_meeting_reminder',
            customMessage: `Reminder: next management review meeting is on ${meeting.next_meeting_date}.`
          });
          await markReminderSent({
            companyId,
            meetingId: meeting.id,
            reminderType
          });
        }
      }
    }

    for (const item of items) {
      if (!item.target_date || item.status === 'COMPLETED') continue;
      const days = daysBetween(now, new Date(item.target_date));
      if (days === 7 || days === 1) {
        const reminderType = `action_due_${days}d`;
        const sent = await wasReminderSent({
          companyId,
          meetingId: meeting.id,
          itemId: item.id,
          reminderType
        });
        if (sent) continue;
        await sendMeetingNotifications({
          companyId,
          meeting,
          items: [item],
          trigger: 'action_reminder',
          customMessage: `Action reminder: "${item.review_item}" is due on ${item.target_date}.`
        });
        await markReminderSent({
          companyId,
          meetingId: meeting.id,
          itemId: item.id,
          reminderType
        });
      }
      if (days < 0) {
        const overdueDays = Math.abs(days);
        const reminderType = `action_overdue_${overdueDays}d`;
        const alreadySent = await wasReminderSent({
          companyId,
          meetingId: meeting.id,
          itemId: item.id,
          reminderType
        });
        if (alreadySent) continue;

        const escalationTargets = new Set<UUID>();
        if (item.responsible_user_id) {
          escalationTargets.add(item.responsible_user_id);
          const supervisorId = await listSupervisorForUser(companyId, item.responsible_user_id);
          if (supervisorId) escalationTargets.add(supervisorId);
        }
        managerAndSupervisors.forEach((userId) => escalationTargets.add(userId));
        if (overdueDays >= OVERDUE_ADMIN_ESCALATION_DAYS) {
          adminOwners.forEach((userId) => escalationTargets.add(userId));
        }

        await Promise.all(
          [...escalationTargets].map((userId) =>
            createNotification(
              companyId,
              userId,
              'warning',
              'Overdue Review Action Escalation',
              `Action "${item.review_item}" is overdue (target ${item.target_date}).`,
              { meetingId: meeting.id, itemId: item.id }
            ).catch(() => undefined)
          )
        );

        await sendMeetingNotifications({
          companyId,
          meeting,
          items: [item],
          trigger: 'action_overdue',
          customMessage: `Escalation: action "${item.review_item}" is overdue.`
        });
        await markReminderSent({
          companyId,
          meetingId: meeting.id,
          itemId: item.id,
          reminderType
        });
      }
    }
  }
}

