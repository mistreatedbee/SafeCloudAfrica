import { describe, expect, it } from 'vitest';
import {
  applyComplaintStatusChange,
  getComplaintCloseWarningMessage,
  hasDirtyComplaintForm,
  serializeComplaintFormState,
  type ComplaintFormDraft
} from './qualityCustomerComplaints.helpers';

function makeForm(): ComplaintFormDraft {
  return {
    id: 'complaint-1',
    complaintRefNo: 'CCL-2026-0001',
    customerName: 'Acme Foods',
    personHandlingUserId: 'user-1',
    personHandlingEmployeeId: '',
    personHandlingNameSnapshot: 'Lerato Sithole',
    dateReceived: '2026-04-20',
    description: 'Damaged goods',
    actionTaken: '',
    dateClosed: '',
    status: 'MONITORING_REQUIRED',
    customerFeedback: '',
    createLinkedTask: false,
    linkedTaskAssigneeUserId: ''
  };
}

describe('qualityCustomerComplaints helpers', () => {
  it('detects dirty form changes against the saved baseline', () => {
    const form = makeForm();
    const baseline = serializeComplaintFormState(form);

    expect(hasDirtyComplaintForm(form, baseline)).toBe(false);
    expect(hasDirtyComplaintForm({ ...form, description: 'Updated issue detail' }, baseline)).toBe(true);
  });

  it('auto-fills Date Closed when status changes to Closed', () => {
    const next = applyComplaintStatusChange(makeForm(), 'CLOSED', '2026-04-21');
    expect(next.status).toBe('CLOSED');
    expect(next.dateClosed).toBe('2026-04-21');
  });

  it('clears Date Closed when moving away from Closed', () => {
    const next = applyComplaintStatusChange({ ...makeForm(), status: 'CLOSED', dateClosed: '2026-04-21' }, 'MONITORING_REQUIRED', '2026-04-21');
    expect(next.status).toBe('MONITORING_REQUIRED');
    expect(next.dateClosed).toBe('');
  });

  it('uses the expected close warning copy', () => {
    expect(getComplaintCloseWarningMessage()).toBe('You have unsaved changes. Are you sure you want to close?');
  });
});
