import type { CustomerComplaintStatus, UUID } from '../api/models/entities';

export type ComplaintFormDraft = {
  id?: UUID;
  complaintRefNo: string;
  customerName: string;
  personHandlingUserId: UUID | '';
  personHandlingEmployeeId: UUID | '';
  personHandlingNameSnapshot: string;
  dateReceived: string;
  description: string;
  actionTaken: string;
  dateClosed: string;
  status: CustomerComplaintStatus;
  customerFeedback: string;
  createLinkedTask: boolean;
  linkedTaskAssigneeUserId: UUID | '';
};

export function serializeComplaintFormState(form: ComplaintFormDraft): string {
  return JSON.stringify({
    id: form.id ?? null,
    complaintRefNo: form.complaintRefNo,
    customerName: form.customerName,
    personHandlingUserId: form.personHandlingUserId,
    personHandlingEmployeeId: form.personHandlingEmployeeId,
    personHandlingNameSnapshot: form.personHandlingNameSnapshot,
    dateReceived: form.dateReceived,
    description: form.description,
    actionTaken: form.actionTaken,
    dateClosed: form.dateClosed,
    status: form.status,
    customerFeedback: form.customerFeedback,
    createLinkedTask: form.createLinkedTask,
    linkedTaskAssigneeUserId: form.linkedTaskAssigneeUserId
  });
}

export function hasDirtyComplaintForm(form: ComplaintFormDraft, baseline: string): boolean {
  return serializeComplaintFormState(form) !== baseline;
}

export function getComplaintCloseWarningMessage(): string {
  return 'You have unsaved changes. Are you sure you want to close?';
}

export function applyComplaintStatusChange<T extends Pick<ComplaintFormDraft, 'status' | 'dateClosed'>>(
  form: T,
  nextStatus: CustomerComplaintStatus,
  today: string
): T {
  if (nextStatus === 'CLOSED') {
    return {
      ...form,
      status: nextStatus,
      dateClosed: form.dateClosed || today
    };
  }

  return {
    ...form,
    status: nextStatus,
    dateClosed: ''
  };
}
