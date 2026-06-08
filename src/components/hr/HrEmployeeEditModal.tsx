import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID, Department, Site } from '../../api/models/entities';
import type { HrEmployee, HrEmployeeDependent, HrEmployeeSensitiveDetails } from '../../api/services/hrService';
import { replaceHrEmployeeDependents, upsertHrEmployee, upsertHrEmployeeSensitiveDetails } from '../../api/services/hrService';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments } from '../../api/services/departmentsService';
import { listSites } from '../../api/services/sitesService';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  employee: HrEmployee;
  canViewRestrictedFields: boolean;
  canAccessSensitiveFields: boolean;
  initialSensitiveDetails?: HrEmployeeSensitiveDetails | null;
  initialDependents?: HrEmployeeDependent[];
  onSaved?: () => void;
};

type DependentDraft = {
  key: string;
  dependent_name: string;
  relationship: string;
  contact_details: string;
};

function newDependentDraft(): DependentDraft {
  return {
    key: String(Math.random()).slice(2),
    dependent_name: '',
    relationship: '',
    contact_details: ''
  };
}

function maskAccountNumber(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const last4 = v.replace(/\s+/g, '').slice(-4);
  return `${'•'.repeat(Math.max(0, v.length - 4))}${last4}`;
}

export function HrEmployeeEditModal(props: Props) {
  const { employee } = props;
  const sd = props.initialSensitiveDetails ?? null;
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `hr-employee-edit:${props.employee.id}:${props.actorUserId}`;

  const [firstName, setFirstName] = useState(employee.first_name ?? '');
  const [lastName, setLastName] = useState(employee.last_name ?? '');
  const [employeeNo, setEmployeeNo] = useState(employee.employee_no ?? '');
  const [email, setEmail] = useState(employee.email ?? '');
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [jobTitle, setJobTitle] = useState(employee.job_title ?? '');
  const [employmentStatus, setEmploymentStatus] = useState(employee.employment_status);
  const [employmentType, setEmploymentType] = useState(employee.employment_type ?? '');
  const [startDate, setStartDate] = useState(employee.start_date ?? '');
  const [contractExpiryDate, setContractExpiryDate] = useState(employee.contract_expiry_date ?? '');
  const [departmentId, setDepartmentId] = useState<string>(String(employee.department_id ?? ''));
  const [siteId, setSiteId] = useState<string>(String(employee.site_id ?? ''));
  const [supervisorUserId, setSupervisorUserId] = useState<UUID | ''>((employee.supervisor_user_id as UUID) ?? '');
  const [supervisorEmployeeId, setSupervisorEmployeeId] = useState<UUID | ''>((employee as any).supervisor_employee_id ?? '');

  const [idNumber, setIdNumber] = useState(employee.id_number ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(employee.date_of_birth ?? '');
  const [address, setAddress] = useState(employee.address ?? '');
  const [emergencyContactName, setEmergencyContactName] = useState(employee.emergency_contact_name ?? '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(employee.emergency_contact_phone ?? '');

  // Sensitive sections (only saved when canAccessSensitiveFields)
  const [medicalAidName, setMedicalAidName] = useState(sd?.medical_aid_name ?? '');
  const [medicalAidMembershipNumber, setMedicalAidMembershipNumber] = useState(sd?.medical_aid_membership_number ?? '');

  const [maritalStatus, setMaritalStatus] = useState<HrEmployeeSensitiveDetails['marital_status']>(sd?.marital_status ?? null);
  const [partnerName, setPartnerName] = useState(sd?.partner_name ?? '');

  const [taxNumber, setTaxNumber] = useState(sd?.tax_number ?? '');
  const [passportNumber, setPassportNumber] = useState(sd?.passport_number ?? '');
  const [passportExpiryDate, setPassportExpiryDate] = useState(sd?.passport_expiry_date ?? '');
  const [permitNumber, setPermitNumber] = useState(sd?.permit_number ?? '');
  const [permitExpiryDate, setPermitExpiryDate] = useState(sd?.permit_expiry_date ?? '');
  const [countryOfIssue, setCountryOfIssue] = useState(sd?.country_of_issue ?? '');

  const [bankName, setBankName] = useState(sd?.bank_name ?? '');
  const [accountHolderName, setAccountHolderName] = useState(sd?.account_holder_name ?? '');
  const [branchCode, setBranchCode] = useState(sd?.branch_code ?? '');
  const [accountType, setAccountType] = useState(sd?.account_type ?? '');
  const [accountNumberMasked] = useState(maskAccountNumber(sd?.account_number));
  const [editAccountNumber, setEditAccountNumber] = useState(false);
  const [accountNumberDraft, setAccountNumberDraft] = useState('');

  const [dependents, setDependents] = useState<DependentDraft[]>(
    (props.initialDependents ?? []).map((d) => ({
      key: d.id,
      dependent_name: d.dependent_name ?? '',
      relationship: d.relationship ?? '',
      contact_details: d.contact_details ?? ''
    }))
  );

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

  const dependentValidationError = useMemo(() => {
    if (!props.canAccessSensitiveFields) return null;
    for (const d of dependents) {
      const anyFilled = d.dependent_name.trim() || d.relationship.trim() || d.contact_details.trim();
      if (anyFilled && (!d.dependent_name.trim() || !d.relationship.trim())) {
        return 'Each dependent must have a name and relationship.';
      }
    }
    return null;
  }, [dependents, props.canAccessSensitiveFields]);

  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (firstName.trim().length > 0 ||
        lastName.trim().length > 0 ||
        employeeNo.trim().length > 0 ||
        email.trim().length > 0 ||
        phone.trim().length > 0 ||
        jobTitle.trim().length > 0 ||
        startDate.trim().length > 0 ||
        contractExpiryDate.trim().length > 0 ||
        employmentType.trim().length > 0 ||
        departmentId.trim().length > 0 ||
        siteId.trim().length > 0 ||
        supervisorUserId.trim().length > 0 ||
        supervisorEmployeeId.trim().length > 0 ||
        (props.canAccessSensitiveFields &&
          (dependents.some(
            (d) => d.dependent_name.trim().length > 0 || d.relationship.trim().length > 0 || d.contact_details.trim().length > 0
          ) ||
            medicalAidName.trim().length > 0 ||
            medicalAidMembershipNumber.trim().length > 0 ||
            partnerName.trim().length > 0 ||
            maritalStatus !== null)) ||
        (props.canViewRestrictedFields &&
          (idNumber.trim().length > 0 || dateOfBirth.trim().length > 0 || address.trim().length > 0 || emergencyContactName.trim().length > 0 || emergencyContactPhone.trim().length > 0))),
    [
      address,
      contractExpiryDate,
      dateOfBirth,
      dependents,
      departmentId,
      emergencyContactName,
      emergencyContactPhone,
      email,
      employeeNo,
      employmentType,
      firstName,
      idNumber,
      jobTitle,
      lastName,
      medicalAidMembershipNumber,
      medicalAidName,
      maritalStatus,
      partnerName,
      phone,
      props.canAccessSensitiveFields,
      props.canViewRestrictedFields,
      props.open,
      siteId,
      startDate,
      supervisorUserId,
      supervisorEmployeeId
    ]
  );

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      firstName,
      lastName,
      employeeNo,
      email,
      phone,
      jobTitle,
      employmentStatus,
      employmentType,
      startDate,
      contractExpiryDate,
      departmentId,
      siteId,
      supervisorUserId,
      supervisorEmployeeId,
      ...(props.canViewRestrictedFields
        ? {
            idNumber,
            dateOfBirth,
            address,
            emergencyContactName,
            emergencyContactPhone
          }
        : {}),
      ...(props.canAccessSensitiveFields
        ? {
            dependents,
            medicalAidName,
            medicalAidMembershipNumber,
            maritalStatus,
            partnerName,
            taxNumber,
            passportNumber,
            passportExpiryDate,
            permitNumber,
            permitExpiryDate,
            countryOfIssue,
            bankName,
            accountHolderName,
            branchCode,
            accountType,
            editAccountNumber,
            accountNumberDraft
          }
        : {})
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      firstName?: string;
      lastName?: string;
      employeeNo?: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      employmentStatus?: HrEmployee['employment_status'];
      employmentType?: string;
      startDate?: string;
      contractExpiryDate?: string;
      departmentId?: string;
      siteId?: string;
      supervisorUserId?: UUID | '' | null;
      supervisorEmployeeId?: UUID | '' | null;
      idNumber?: string;
      dateOfBirth?: string;
      address?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      dependents?: DependentDraft[];
      medicalAidName?: string;
      medicalAidMembershipNumber?: string;
      maritalStatus?: HrEmployeeSensitiveDetails['marital_status'];
      partnerName?: string;
      taxNumber?: string;
      passportNumber?: string;
      passportExpiryDate?: string;
      permitNumber?: string;
      permitExpiryDate?: string;
      countryOfIssue?: string;
      bankName?: string;
      accountHolderName?: string;
      branchCode?: string;
      accountType?: string;
      editAccountNumber?: boolean;
      accountNumberDraft?: string;
    }>(draftKey);
    if (!restored) return;
    setFirstName(restored.firstName ?? firstName);
    setLastName(restored.lastName ?? lastName);
    setEmployeeNo(restored.employeeNo ?? employeeNo);
    setEmail(restored.email ?? email);
    setPhone(restored.phone ?? phone);
    setJobTitle(restored.jobTitle ?? jobTitle);
    if (restored.employmentStatus) setEmploymentStatus(restored.employmentStatus);
    if (restored.employmentType !== undefined) setEmploymentType(restored.employmentType);
    if (restored.startDate !== undefined) setStartDate(restored.startDate);
    if (restored.contractExpiryDate !== undefined) setContractExpiryDate(restored.contractExpiryDate);
    if (restored.departmentId !== undefined) setDepartmentId(restored.departmentId);
    if (restored.siteId !== undefined) setSiteId(restored.siteId);
    if (restored.supervisorUserId !== undefined) setSupervisorUserId((restored.supervisorUserId as any) ?? '');
    if (restored.supervisorEmployeeId !== undefined) setSupervisorEmployeeId((restored.supervisorEmployeeId as any) ?? '');

    if (props.canViewRestrictedFields) {
      if (restored.idNumber !== undefined) setIdNumber(restored.idNumber);
      if (restored.dateOfBirth !== undefined) setDateOfBirth(restored.dateOfBirth);
      if (restored.address !== undefined) setAddress(restored.address);
      if (restored.emergencyContactName !== undefined) setEmergencyContactName(restored.emergencyContactName);
      if (restored.emergencyContactPhone !== undefined) setEmergencyContactPhone(restored.emergencyContactPhone);
    }

    if (props.canAccessSensitiveFields) {
      if (Array.isArray(restored.dependents)) setDependents(restored.dependents);

      if (restored.medicalAidName !== undefined) setMedicalAidName(restored.medicalAidName);
      if (restored.medicalAidMembershipNumber !== undefined) setMedicalAidMembershipNumber(restored.medicalAidMembershipNumber);
      if (restored.maritalStatus !== undefined) setMaritalStatus(restored.maritalStatus as any);
      if (restored.partnerName !== undefined) setPartnerName(restored.partnerName);

      if (restored.taxNumber !== undefined) setTaxNumber(restored.taxNumber);
      if (restored.passportNumber !== undefined) setPassportNumber(restored.passportNumber);
      if (restored.passportExpiryDate !== undefined) setPassportExpiryDate(restored.passportExpiryDate);
      if (restored.permitNumber !== undefined) setPermitNumber(restored.permitNumber);
      if (restored.permitExpiryDate !== undefined) setPermitExpiryDate(restored.permitExpiryDate);
      if (restored.countryOfIssue !== undefined) setCountryOfIssue(restored.countryOfIssue);

      if (restored.bankName !== undefined) setBankName(restored.bankName);
      if (restored.accountHolderName !== undefined) setAccountHolderName(restored.accountHolderName);
      if (restored.branchCode !== undefined) setBranchCode(restored.branchCode);
      if (restored.accountType !== undefined) setAccountType(restored.accountType);

      if (restored.editAccountNumber !== undefined) setEditAccountNumber(restored.editAccountNumber);
      if (restored.accountNumberDraft !== undefined) setAccountNumberDraft(restored.accountNumberDraft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    if (dependentValidationError) {
      setError(dependentValidationError);
      return;
    }
    setError(null);
    try {
      setLoading(true);

      await upsertHrEmployee({
        id: employee.id,
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
        contract_expiry_date: contractExpiryDate.trim() || null,
        department_id: departmentId ? (departmentId as any) : null,
        site_id: siteId ? (siteId as any) : null,
        supervisor_user_id: supervisorUserId || null,
        supervisor_employee_id: supervisorEmployeeId || null,
        id_number: props.canViewRestrictedFields ? (idNumber.trim() || null) : employee.id_number,
        date_of_birth: props.canViewRestrictedFields ? (dateOfBirth.trim() || null) : employee.date_of_birth,
        address: props.canViewRestrictedFields ? (address.trim() || null) : employee.address,
        emergency_contact_name: props.canViewRestrictedFields ? (emergencyContactName.trim() || null) : employee.emergency_contact_name,
        emergency_contact_phone: props.canViewRestrictedFields ? (emergencyContactPhone.trim() || null) : employee.emergency_contact_phone
      });

      if (props.canAccessSensitiveFields) {
        await upsertHrEmployeeSensitiveDetails({
          companyId: props.companyId,
          employeeId: employee.id,
          actorUserId: props.actorUserId,
          patch: {
            medical_aid_name: medicalAidName.trim() || null,
            medical_aid_membership_number: medicalAidMembershipNumber.trim() || null,
            marital_status: maritalStatus ?? null,
            partner_name: partnerName.trim() || null,
            tax_number: taxNumber.trim() || null,
            passport_number: passportNumber.trim() || null,
            passport_expiry_date: passportExpiryDate.trim() || null,
            permit_number: permitNumber.trim() || null,
            permit_expiry_date: permitExpiryDate.trim() || null,
            country_of_issue: countryOfIssue.trim() || null,
            bank_name: bankName.trim() || null,
            account_holder_name: accountHolderName.trim() || null,
            account_number: editAccountNumber ? (accountNumberDraft.trim() || null) : (sd?.account_number ?? null),
            branch_code: branchCode.trim() || null,
            account_type: accountType.trim() || null
          }
        });

        const cleanedDependents = dependents
          .map((d) => ({
            dependent_name: d.dependent_name.trim(),
            relationship: d.relationship.trim(),
            contact_details: d.contact_details.trim() || null
          }))
          .filter((d) => d.dependent_name || d.relationship || d.contact_details);

        await replaceHrEmployeeDependents({
          companyId: props.companyId,
          employeeId: employee.id,
          actorUserId: props.actorUserId,
          dependents: cleanedDependents
        });
      }

      props.onSaved?.();
      clearDraft(draftKey);
    } catch (err: any) {
      setError(toUserFacingError(err, formatAuthError(err)));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Edit employee</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Employee: {employee.first_name} {employee.last_name} · {employee.employee_no}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
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

          <SectionTitle title="Employee Info" />

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

          <SectionTitle title="Contract" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Contract expiry date</label>
              <input
                type="date"
                value={contractExpiryDate ?? ''}
                onChange={(e) => setContractExpiryDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
              <p className="text-xs text-charcoal-400 mt-1">Optional — used for contract renewal/termination reminders.</p>
            </div>
          </div>

          <SectionTitle title="Work Details" />

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
                value={supervisorEmployeeId}
                valueField="id"
                includeUnlinked={true}
                onChange={(val) => setSupervisorEmployeeId(val)}
                label="Manager / Supervisor"
                placeholder="Select manager or supervisor (optional)"
              />
            </div>
          </div>

          {props.canAccessSensitiveFields && (
            <>
              <SectionTitle title="Personal Info" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Marital status</label>
                  <select
                    value={maritalStatus ?? ''}
                    onChange={(e) => setMaritalStatus((e.target.value || null) as any)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  >
                    <option value="">Select (optional)</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Separated">Separated</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Domestic Partner">Domestic Partner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Partner’s name</label>
                  <input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <SectionTitle title="Medical Info" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Medical Aid Name</label>
                  <input
                    value={medicalAidName}
                    onChange={(e) => setMedicalAidName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Medical Aid Membership Number</label>
                  <input
                    value={medicalAidMembershipNumber}
                    onChange={(e) => setMedicalAidMembershipNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <SectionTitle title="Legal Info" />
              {props.canViewRestrictedFields && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">ID Number / Passport Number</label>
                    <input
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Tax Number</label>
                  <input
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Country of Issue</label>
                  <input
                    value={countryOfIssue}
                    onChange={(e) => setCountryOfIssue(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Passport Number</label>
                  <input
                    value={passportNumber}
                    onChange={(e) => setPassportNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Passport Expiry Date</label>
                  <input
                    type="date"
                    value={passportExpiryDate ?? ''}
                    onChange={(e) => setPassportExpiryDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Permit Number</label>
                  <input
                    value={permitNumber}
                    onChange={(e) => setPermitNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Permit Expiry Date</label>
                  <input
                    type="date"
                    value={permitExpiryDate ?? ''}
                    onChange={(e) => setPermitExpiryDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <SectionTitle title="Banking Info" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Bank Name</label>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Account Holder Name</label>
                  <input
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Account Number</label>
                  {!editAccountNumber ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={accountNumberMasked || ''}
                        readOnly
                        placeholder="Not set"
                        className="w-full px-4 py-2.5 bg-surface-50 border border-surface-300 rounded-lg text-sm text-charcoal-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditAccountNumber(true);
                          setAccountNumberDraft(sd?.account_number ?? '');
                        }}
                        className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        value={accountNumberDraft}
                        onChange={(e) => setAccountNumberDraft(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditAccountNumber(false);
                          setAccountNumberDraft('');
                        }}
                        className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-charcoal-400 mt-1">Account number is masked by default.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Account Type</label>
                  <input
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Branch Code</label>
                  <input
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              </div>

              <SectionTitle title="Dependents" />
              <div className="space-y-3">
                {dependents.length === 0 && (
                  <p className="text-sm text-charcoal-500">No dependents added.</p>
                )}
                {dependents.map((d, idx) => (
                  <div key={d.key} className="border border-surface-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-charcoal">Dependent {idx + 1}</p>
                      <button
                        type="button"
                        onClick={() => setDependents((prev) => prev.filter((x) => x.key !== d.key))}
                        className="text-sm font-medium text-critical hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Dependent name</label>
                        <input
                          value={d.dependent_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDependents((prev) => prev.map((x) => x.key === d.key ? { ...x, dependent_name: v } : x));
                          }}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Relationship</label>
                        <input
                          value={d.relationship}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDependents((prev) => prev.map((x) => x.key === d.key ? { ...x, relationship: v } : x));
                          }}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Contact details</label>
                      <input
                        value={d.contact_details}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDependents((prev) => prev.map((x) => x.key === d.key ? { ...x, contact_details: v } : x));
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDependents((prev) => [...prev, newDependentDraft()])}
                  className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-semibold text-charcoal hover:bg-surface-50"
                >
                  Add dependent
                </button>
              </div>
            </>
          )}

          {props.canViewRestrictedFields && (
            <div className="border border-surface-200 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-charcoal-600 uppercase tracking-wide">Restricted (POPIA)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!props.canAccessSensitiveFields && (
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">ID Number / Passport Number</label>
                    <input
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    />
                  </div>
                )}
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

function SectionTitle(props: { title: string }) {
  return (
    <div className="pt-2">
      <p className="text-xs font-semibold text-charcoal-600 uppercase tracking-wide">{props.title}</p>
    </div>
  );
}
