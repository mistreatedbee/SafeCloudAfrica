import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { useParams } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { canViewRestrictedFields, getEmployeeIntegratedProfile, logRestrictedFieldAccess } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';
import type { CompanyRole } from '../../api/models/core';
import type { HrEmployee, HrEmployeeDependent, HrEmployeeSensitiveDetails } from '../../api/services/hrService';
import { HrEmployeeEditModal } from '../../components/hr/HrEmployeeEditModal';
import { useDraftManager } from '../../session/DraftManagerProvider';

const TABS = ['overview', 'leave', 'hours', 'performance', 'disciplinary', 'training', 'tasks', 'audit'] as const;
type Tab = (typeof TABS)[number];

function maskValue(value: string | null | undefined, visible = 4): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const compact = raw.replace(/\s+/g, '');
  const suffix = compact.slice(-visible);
  return `${'•'.repeat(Math.max(0, compact.length - visible))}${suffix}`;
}

export function HrEmployeeProfilePage() {
  const { id } = useParams();
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeMembership, isPlatformAdmin } = useTenant();
  const [tab, setTab] = useState<Tab>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const allowedRoles: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
  const canEditEmployee = !!(
    isPlatformAdmin ||
    activeMembership?.is_hr_manager === true ||
    (activeRole && allowedRoles.includes(activeRole))
  );

  const { data: canRestricted } = useAsync(async () => {
    if (!activeCompanyId) return false;
    return canViewRestrictedFields(activeCompanyId);
  }, [activeCompanyId]);

  const { data: payload } = useAsync(async () => {
    if (!activeCompanyId || !id) return null;
    return getEmployeeIntegratedProfile(activeCompanyId, id as UUID);
  }, [activeCompanyId, id, refreshKey]);

  const employee = payload?.employee as HrEmployee | undefined;
  const canSensitive = Boolean(payload?.canSensitive);
  const sensitiveDetails = (payload?.sensitiveDetails as HrEmployeeSensitiveDetails | null | undefined) ?? null;
  const dependents = (payload?.dependents as HrEmployeeDependent[] | undefined) ?? [];
  const leaveBalances = (payload?.balances as Array<Record<string, unknown>> | undefined) ?? [];
  const leaveRequests = (payload?.leaveRequests as Array<Record<string, unknown>> | undefined) ?? [];

  const restricted = useMemo(() => {
    if (!employee) return [] as Array<{ key: string; value: unknown }>;
    return [
      { key: 'id_number', value: employee.id_number },
      { key: 'date_of_birth', value: employee.date_of_birth },
      { key: 'address', value: employee.address },
      { key: 'emergency_contact_name', value: employee.emergency_contact_name },
      { key: 'emergency_contact_phone', value: employee.emergency_contact_phone }
    ];
  }, [employee]);

  const { restoreDraft } = useDraftManager();

  useEffect(() => {
    if (!employee) return;
    if (!user?.id) return;
    if (!canEditEmployee) return;
    if (!payload) return;
    if (showEdit) return;

    const draftKey = `hr-employee-edit:${employee.id}:${user.id}`;
    const restored = restoreDraft(draftKey);
    if (restored) setShowEdit(true);
  }, [canEditEmployee, employee, payload, restoreDraft, showEdit, user?.id]);

  const onRestrictedView = async (field: string) => {
    if (!activeCompanyId || !user?.id || !id) return;
    await logRestrictedFieldAccess({ companyId: activeCompanyId, actorUserId: user.id as UUID, targetEntity: 'hr_employee', targetId: id as UUID, fieldName: field, action: 'view' });
  };

  return (
    <Layout title="Employee Profile">
      <div className="space-y-4">
        <HrSectionNav />
        {successMessage && (
          <div className="bg-teal-50 border border-teal-200 text-sm text-teal-900 rounded-xl px-3 py-2">
            {successMessage}
          </div>
        )}
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          {!employee ? <p className="text-sm text-charcoal-500">Employee not found.</p> : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-charcoal">{String(employee.first_name)} {String(employee.last_name)}</h2>
                <p className="text-sm text-charcoal-500">Employee No: {String(employee.employee_no)} | Status: {String(employee.employment_status)}</p>
              </div>
              {canEditEmployee && activeCompanyId && user?.id && (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
                >
                  Edit Employee
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-2 flex gap-2 overflow-x-auto">
          {TABS.map((key) => (
            <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === key ? 'bg-teal text-white' : 'hover:bg-surface-100'}`}>{key}</button>
          ))}
        </div>

        {tab === 'overview' && employee && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="General">
              <Line label="Email" value={employee.email} />
              <Line label="Phone" value={employee.phone} />
              <Line label="Job Title" value={employee.job_title} />
              <Line label="Employment Type" value={employee.employment_type} />
              <Line label="Start Date" value={employee.start_date} />
              <Line label="Contract Expiry" value={employee.contract_expiry_date} />
              <Line label="Next Review" value={employee.next_review_date} />
            </Card>
            <Card title="Restricted (POPIA)">
              {restricted.map((item) => (
                <div key={item.key} className="flex items-center justify-between border-b border-surface-100 py-2 text-sm">
                  <span className="text-charcoal-500">{item.key}</span>
                  {canRestricted ? (
                    <button className="text-teal" onClick={() => void onRestrictedView(item.key)}>{String(item.value ?? '-')}</button>
                  ) : (
                    <span className="text-charcoal-300">Restricted</span>
                  )}
                </div>
              ))}
            </Card>
            <Card title="Sensitive HR Fields">
              {canSensitive ? (
                <>
                  <Line label="Marital Status" value={sensitiveDetails?.marital_status} />
                  <Line label="Partner Name" value={sensitiveDetails?.partner_name} />
                  <Line label="Medical Aid" value={sensitiveDetails?.medical_aid_name} />
                  <Line label="Medical Aid Membership" value={sensitiveDetails?.medical_aid_membership_number} />
                  <Line label="Tax Number" value={sensitiveDetails?.tax_number} />
                  <Line label="Passport Number" value={sensitiveDetails?.passport_number} />
                  <Line label="Passport Expiry" value={sensitiveDetails?.passport_expiry_date} />
                  <Line label="Permit Number" value={sensitiveDetails?.permit_number} />
                  <Line label="Permit Expiry" value={sensitiveDetails?.permit_expiry_date} />
                  <Line label="Country Of Issue" value={sensitiveDetails?.country_of_issue} />
                  <Line label="Bank Name" value={sensitiveDetails?.bank_name} />
                  <Line label="Account Holder" value={sensitiveDetails?.account_holder_name} />
                  <Line label="Account Number" value={maskValue(sensitiveDetails?.account_number)} />
                  <Line label="Branch Code" value={sensitiveDetails?.branch_code} />
                  <Line label="Account Type" value={sensitiveDetails?.account_type} />
                </>
              ) : (
                <p className="text-sm text-charcoal-500">Sensitive employee fields are restricted for your current role.</p>
              )}
            </Card>
            <Card title="Dependents">
              {canSensitive ? (
                dependents.length > 0 ? (
                  <div className="space-y-3">
                    {dependents.map((dependent) => (
                      <div key={dependent.id} className="rounded-lg border border-surface-200 p-3">
                        <Line label="Name" value={dependent.dependent_name} />
                        <Line label="Relationship" value={dependent.relationship} />
                        <Line label="Contact Details" value={dependent.contact_details} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-charcoal-500">No dependents recorded for this employee.</p>
                )
              ) : (
                <p className="text-sm text-charcoal-500">Dependent information is restricted for your current role.</p>
              )}
            </Card>
          </div>
        )}

        {tab === 'leave' && (
          <div className="space-y-4">
            <Card title="Leave balances">
              <div className="space-y-2 text-sm text-charcoal-600">
                {leaveBalances.map((row) => {
                  const remaining = Number(row.remaining_days ?? 0);
                  const label = String(
                    row.leave_type_name ??
                      row.leave_type_label ??
                      row.leave_type ??
                      row.leave_type_id ??
                      'Leave type'
                  );
                  return (
                    <div
                      key={String(row.id ?? `${label}-${row.year}`)}
                      className="flex items-center justify-between border border-surface-100 rounded-lg px-2 py-1.5"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {label}
                        </span>
                        <span className="text-xs text-charcoal-500">
                          Year {String(row.year ?? '')} · Allocated {String(row.allocated_days ?? 0)} · Used {String(row.used_days ?? 0)}
                        </span>
                      </div>
                      <span
                        className={`ml-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          remaining <= 3
                            ? 'bg-amber-50 text-amber-800 border border-amber-400'
                            : 'bg-teal-50 text-teal-800 border border-teal-400'
                        }`}
                      >
                        {remaining} day{remaining === 1 ? '' : 's'} left
                      </span>
                    </div>
                  );
                })}
                {leaveBalances.length === 0 && (
                  <p className="text-sm text-charcoal-500">No leave balance records for this employee.</p>
                )}
              </div>
            </Card>
            <Card title="Leave records">
              <SimpleTable
                rows={leaveRequests}
                cols={['start_date', 'end_date', 'total_days', 'status', 'decline_reason']}
              />
            </Card>
          </div>
        )}
        {tab === 'hours' && (
          <Card title="Hours worked">
            <SimpleTable rows={(payload?.timesheets as Array<Record<string, unknown>> | undefined) ?? []} cols={['date', 'hours_worked', 'overtime_hours', 'status']} />
            <div className="mt-3">
              <h4 className="font-medium text-sm mb-1">Monthly totals</h4>
              <SimpleTable rows={(payload?.monthlyHours as Array<Record<string, unknown>> | undefined) ?? []} cols={['year', 'month', 'total_hours', 'overtime_hours', 'total_with_overtime']} />
            </div>
          </Card>
        )}
        {tab === 'performance' && (
          <div className="space-y-4">
            <Card title="Performance reviews">
              <SimpleTable rows={(payload?.performance as Array<Record<string, unknown>> | undefined) ?? []} cols={['cycle', 'review_date', 'overall_rating', 'manager_rating', 'corrective_due_date', 'status']} />
            </Card>
            <Card title="KPI history">
              <KpiHistoryTable rows={(payload?.kpiHistory as Array<Record<string, unknown>> | undefined) ?? []} />
            </Card>
          </div>
        )}
        {tab === 'disciplinary' && (
          <Card title="Warnings & offences">
            <SimpleTable rows={(payload?.disciplinary as Array<Record<string, unknown>> | undefined) ?? []} cols={['offence_type', 'description', 'offence_severity', 'repeat_offence_flag', 'status']} />
          </Card>
        )}
        {tab === 'training' && (
          <Card title="Training status">
            <SimpleTable rows={(payload?.trainingRecords as Array<Record<string, unknown>> | undefined) ?? []} cols={['status', 'planned_date', 'completed_date', 'expiry_date']} />
          </Card>
        )}
        {tab === 'tasks' && (
          <Card title="Assigned tasks">
            <SimpleTable rows={(payload?.assignedTasks as Array<Record<string, unknown>> | undefined) ?? []} cols={['title', 'status', 'priority', 'due_at']} />
          </Card>
        )}
        {tab === 'audit' && (
          <Card title="Audit trail">
            <SimpleTable rows={(payload?.auditTrail as Array<Record<string, unknown>> | undefined) ?? []} cols={['action', 'entity_type', 'created_at']} />
          </Card>
        )}

        {employee && activeCompanyId && user?.id && (
          <HrEmployeeEditModal
            open={showEdit}
            onClose={() => setShowEdit(false)}
            companyId={activeCompanyId}
            actorUserId={user.id as UUID}
            employee={employee}
            canViewRestrictedFields={!!canRestricted}
            canAccessSensitiveFields={canSensitive}
            initialSensitiveDetails={sensitiveDetails}
            initialDependents={dependents}
            onSaved={() => {
              setShowEdit(false);
              setRefreshKey((x) => x + 1);
              setSuccessMessage('Employee saved successfully');
              window.setTimeout(() => {
                setSuccessMessage(null);
              }, 4000);
            }}
          />
        )}
      </div>
    </Layout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-surface-300 rounded-xl p-4"><h3 className="text-sm font-semibold mb-2">{title}</h3>{children}</div>;
}

function Line({ label, value }: { label: string; value: unknown }) {
  return <div className="flex justify-between border-b border-surface-100 py-2 text-sm"><span className="text-charcoal-500">{label}</span><span>{String(value ?? '-')}</span></div>;
}

function SimpleTable({ rows, cols }: { rows: Array<Record<string, unknown>>; cols: string[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-50">
          <tr>{cols.map((col) => <th key={col} className="text-left px-2 py-1">{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id ?? JSON.stringify(row).slice(0, 24))} className="border-t border-surface-100">
              {cols.map((col) => <td key={col} className="px-2 py-1">{String(row[col] ?? '-')}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-2 text-charcoal-500">No records</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function KpiHistoryTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const achieved = rows.filter((row) => String(row.status ?? '') === 'Achieved').length;
  const notAchieved = rows.filter((row) => String(row.status ?? '') === 'Not Achieved').length;
  const trendMessage = rows.length === 0
    ? 'No KPI assessments captured yet.'
    : `Trend snapshot: ${achieved} achieved, ${notAchieved} not achieved across ${rows.length} KPI entries.`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-charcoal-500">{trendMessage}</p>
      <SimpleTable
        rows={rows}
        cols={['kpi_name', 'assessment_period', 'target', 'actual_performance', 'manager_rating', 'status']}
      />
    </div>
  );
}
