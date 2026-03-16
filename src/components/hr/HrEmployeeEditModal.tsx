import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID, Department, Site } from '../../api/models/entities';
import type { HrEmployee } from '../../api/services/hrService';
import { upsertHrEmployee } from '../../api/services/hrService';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments } from '../../api/services/departmentsService';
import { listSites } from '../../api/services/sitesService';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  employee: HrEmployee;
  canViewRestrictedFields: boolean;
  onSaved?: () => void;
};

export function HrEmployeeEditModal(props: Props) {
  const { employee } = props;

  const [firstName, setFirstName] = useState(employee.first_name ?? '');
  const [lastName, setLastName] = useState(employee.last_name ?? '');
  const [employeeNo, setEmployeeNo] = useState(employee.employee_no ?? '');
  const [email, setEmail] = useState(employee.email ?? '');
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [jobTitle, setJobTitle] = useState(employee.job_title ?? '');
  const [employmentStatus, setEmploymentStatus] = useState(employee.employment_status);
  const [employmentType, setEmploymentType] = useState(employee.employment_type ?? '');
  const [startDate, setStartDate] = useState(employee.start_date ?? '');
  const [departmentId, setDepartmentId] = useState<string>(String(employee.department_id ?? ''));
  const [siteId, setSiteId] = useState<string>(String(employee.site_id ?? ''));
  const [supervisorUserId, setSupervisorUserId] = useState<UUID | ''>((employee.supervisor_user_id as UUID) ?? '');

  const [idNumber, setIdNumber] = useState(employee.id_number ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(employee.date_of_birth ?? '');
  const [address, setAddress] = useState(employee.address ?? '');
  const [emergencyContactName, setEmergencyContactName] = useState(employee.emergency_contact_name ?? '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(employee.emergency_contact_phone ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: departments } = useAsync<Department[]>(async () => listDepartments(props.companyId), [props.companyId]);
  const { data: sites } = useAsync<Site[]>(async () => listSites(props.companyId), [props.companyId]);

  const canSubmit = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      employeeNo.trim().length > 0 &&
      email.trim().length > 3 &&
      startDate.trim().length > 0
    );
  }, [email, employeeNo, firstName, lastName, startDate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    try {
      setLoading(true);

      await upsertHrEmployee({
        company_id: props.companyId,
        created_by_user_id: props.actorUserId,
        employee_no: employeeNo.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
        employment_status: employmentStatus,
        employment_type: employmentType.trim() || employee.employment_type,
        start_date: startDate.trim(),
        department_id: departmentId ? (departmentId as any) : null,
        site_id: siteId ? (siteId as any) : null,
        supervisor_user_id: supervisorUserId || null,
        id_number: props.canViewRestrictedFields ? (idNumber.trim() || null) : employee.id_number,
        date_of_birth: props.canViewRestrictedFields ? (dateOfBirth.trim() || null) : employee.date_of_birth,
        address: props.canViewRestrictedFields ? (address.trim() || null) : employee.address,
        emergency_contact_name: props.canViewRestrictedFields ? (emergencyContactName.trim() || null) : employee.emergency_contact_name,
        emergency_contact_phone: props.canViewRestrictedFields ? (emergencyContactPhone.trim() || null) : employee.emergency_contact_phone
      });

      props.onSaved?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Edit employee</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Employee: {employee.first_name} {employee.last_name} · {employee.employee_no}
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not save</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee Number</label>
              <input
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Last name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Phone number</label>
              <input
                value={phone ?? ''}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Job title</label>
              <input
                value={jobTitle ?? ''}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employment type</label>
              <input
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                placeholder="e.g. Full-time, Part-time"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employment status</label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as HrEmployee['employment_status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="ONBOARDING">Onboarding</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TERMINATED">Terminated</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Hire date</label>
              <input
                type="date"
                value={startDate ?? ''}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select department (optional)</option>
                {(departments ?? [])
                  .filter((d) => d.is_active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select site (optional)</option>
                {(sites ?? [])
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <HrEmployeeSelect
                companyId={props.companyId}
                value={supervisorUserId}
                onChange={(userId) => {
                  setSupervisorUserId(userId);
                }}
                label="Manager / Supervisor"
                placeholder="Select manager or supervisor (optional)"
              />
            </div>
          </div>

          {props.canViewRestrictedFields && (
            <div className="border border-surface-200 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-charcoal-600 uppercase tracking-wide">Restricted (POPIA)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">ID number</label>
                  <input
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Date of birth</label>
                  <input
                    type="date"
                    value={dateOfBirth ?? ''}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Emergency contact name</label>
                    <input
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Emergency contact phone</label>
                    <input
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

