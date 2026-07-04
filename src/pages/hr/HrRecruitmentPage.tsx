import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, deleteHrRecord, listHrRecords, updateHrRecord, upsertHrEmployee } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { HrExportMenu } from '../../components/hr/HrExportMenu';

const EXPERIENCE_OPTIONS = ['0-1 years', '2-3 years', '4-5 years', '6+ years'];

export function HrRecruitmentPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canHrManagerApprove = ['owner', 'admin'].includes(activeRole ?? '');
  const canDepartmentManagerApprove = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const canWrite = canDepartmentManagerApprove;

  const [vacancyTitle, setVacancyTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [competenciesRequired, setCompetenciesRequired] = useState<string[]>([]);
  const [competencyInput, setCompetencyInput] = useState('');
  const [experienceRequired, setExperienceRequired] = useState('');
  const [referenceChecksDone, setReferenceChecksDone] = useState(false);
  const [vacancyIdForApplicant, setVacancyIdForApplicant] = useState('');

  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [interviewedMetRequirements, setInterviewedMetRequirements] = useState<boolean | null>(null);
  const [offerAccepted, setOfferAccepted] = useState<boolean | null>(null);
  const [leavingReason, setLeavingReason] = useState('');
  const [criminalRecord, setCriminalRecord] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: vacancies, loading: vacanciesLoading, refetch: refetchVacancies } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_vacancies');
  }, [activeCompanyId]);

  const { data: applicants, loading: applicantsLoading, refetch: refetchApplicants } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_applicants');
  }, [activeCompanyId]);

  const vacancyMap = useMemo(() => new Map((vacancies ?? []).map((row) => [row.id as UUID, String(row.title ?? '')])), [vacancies]);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [vacancyQuery, setVacancyQuery] = useState('');
  const [vacancyStatusFilter, setVacancyStatusFilter] = useState('');
  const vacancyStatusOptions = useMemo(
    () => Array.from(new Set((vacancies ?? []).map((row) => String(row.status ?? '')).filter(Boolean))),
    [vacancies]
  );
  const vacancyFiltersActiveCount = [vacancyQuery, vacancyStatusFilter].filter(Boolean).length;
  const filteredVacancies = useMemo(() => {
    return (vacancies ?? []).filter((row) => {
      const q = vacancyQuery.trim().toLowerCase();
      if (q && !String(row.title ?? '').toLowerCase().includes(q)) return false;
      if (vacancyStatusFilter && String(row.status ?? '') !== vacancyStatusFilter) return false;
      const createdAt = String((row as any).created_at ?? '').slice(0, 10);
      if (filterDateFrom && createdAt && createdAt < filterDateFrom) return false;
      if (filterDateTo && createdAt && createdAt > filterDateTo) return false;
      return true;
    });
  }, [vacancies, vacancyQuery, vacancyStatusFilter, filterDateFrom, filterDateTo]);

  const [applicantQuery, setApplicantQuery] = useState('');
  const [applicantStatusFilter, setApplicantStatusFilter] = useState('');
  const applicantStatusOptions = useMemo(
    () => Array.from(new Set((applicants ?? []).map((row) => String(row.status ?? '')).filter(Boolean))),
    [applicants]
  );
  const applicantFiltersActiveCount = [applicantQuery, applicantStatusFilter].filter(Boolean).length;
  const filteredApplicants = useMemo(() => {
    return (applicants ?? []).filter((row) => {
      const q = applicantQuery.trim().toLowerCase();
      if (q) {
        const name = String(row.full_name ?? '').toLowerCase();
        const vacancyTitle = String(vacancyMap.get(row.vacancy_id as UUID) ?? '').toLowerCase();
        if (!name.includes(q) && !vacancyTitle.includes(q)) return false;
      }
      if (applicantStatusFilter && String(row.status ?? '') !== applicantStatusFilter) return false;
      const createdAt = String((row as any).created_at ?? '').slice(0, 10);
      if (filterDateFrom && createdAt && createdAt < filterDateFrom) return false;
      if (filterDateTo && createdAt && createdAt > filterDateTo) return false;
      return true;
    });
  }, [applicants, vacancyMap, applicantQuery, applicantStatusFilter, filterDateFrom, filterDateTo]);

  useEffect(() => {
    const highlightId = new URLSearchParams(window.location.search).get('highlight');
    if (!highlightId) return;
    const el = document.getElementById(`vacancy-${highlightId}`) ?? document.getElementById(`applicant-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-teal', 'ring-offset-2');
    const t = setTimeout(() => el.classList.remove('ring-2', 'ring-teal', 'ring-offset-2'), 3000);
    return () => clearTimeout(t);
  }, [filteredVacancies, filteredApplicants]);

  async function onCreateVacancy() {
    if (!activeCompanyId || !user?.id || !vacancyTitle.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createHrRecord('hr_vacancies', {
        company_id: activeCompanyId,
        title: vacancyTitle.trim(),
        status: 'OPEN',
        job_description: jobDescription.trim() || null,
        competency_required: competenciesRequired[0] ?? null,
        competencies_required: competenciesRequired,
        experience_required: experienceRequired.trim() || null,
        reference_checks_done: referenceChecksDone,
        department_manager_approved: false,
        created_by_user_id: user.id
      });
      setVacancyTitle('');
      setJobDescription('');
      setCompetenciesRequired([]);
      setCompetencyInput('');
      setExperienceRequired('');
      setReferenceChecksDone(false);
      await refetchVacancies();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to create vacancy right now. Please try again.'));
    }
  }

  async function onCreateApplicant() {
    if (!activeCompanyId || !user?.id || !applicantName.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createHrRecord('hr_applicants', {
        company_id: activeCompanyId,
        vacancy_id: vacancyIdForApplicant || null,
        full_name: applicantName.trim(),
        email: applicantEmail.trim() || null,
        status: 'NEW',
        cv_file_ids: [],
        interviewed_met_requirements: interviewedMetRequirements,
        offer_accepted: offerAccepted,
        previous_employer_leaving_reason: leavingReason.trim() || null,
        criminal_record: criminalRecord,
        hr_manager_approved: false,
        department_manager_approved: false,
        created_by_user_id: user.id
      });
      setApplicantName('');
      setApplicantEmail('');
      setInterviewedMetRequirements(null);
      setOfferAccepted(null);
      setLeavingReason('');
      setCriminalRecord(null);
      await refetchApplicants();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to create applicant right now. Please try again.'));
    }
  }

  async function approveVacancyAsDepartmentManager(rowId: UUID) {
    if (!activeCompanyId || !user?.id || !canDepartmentManagerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await updateHrRecord('hr_vacancies', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch: {
          department_manager_approved: true,
          department_manager_approved_by: user.id,
          department_manager_approved_at: new Date().toISOString()
        }
      });
      await refetchVacancies();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this vacancy right now.'));
    }
  }

  async function setReferenceChecked(rowId: UUID, value: boolean) {
    if (!activeCompanyId || !user?.id || !canWrite) return;
    setError(null);
    setSuccess(null);
    try {
      await updateHrRecord('hr_vacancies', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch: { reference_checks_done: value }
      });
      await refetchVacancies();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update reference checks right now.'));
    }
  }

  async function approveApplicant(rowId: UUID, actor: 'hr' | 'dept') {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    const patch =
      actor === 'hr'
        ? { hr_manager_approved: true, hr_manager_approved_by: user.id, hr_manager_approved_at: new Date().toISOString() }
        : { department_manager_approved: true, department_manager_approved_by: user.id, department_manager_approved_at: new Date().toISOString() };
    try {
      await updateHrRecord('hr_applicants', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch
      });
      await refetchApplicants();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this applicant right now.'));
    }
  }

  async function convertApplicantToEmployee(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    setSuccess(null);
    const hrApproved = Boolean(row.hr_manager_approved);
    const deptApproved = Boolean(row.department_manager_approved);
    if (!hrApproved || !deptApproved) {
      setError('Applicant requires both HR Manager and Department Manager approval before conversion.');
      return;
    }
    const vacancyId = row.vacancy_id as UUID | null;
    if (vacancyId) {
      const vacancy = (vacancies ?? []).find((v) => v.id === vacancyId);
      if (!vacancy || !vacancy.department_manager_approved || !vacancy.reference_checks_done) {
        setError('Vacancy must be department-approved and reference checks completed before conversion.');
        return;
      }
    }
    const fullName = String(row.full_name ?? '').trim();
    const [firstName, ...rest] = fullName.split(' ').filter(Boolean);
    const lastName = rest.join(' ') || 'Unknown';
    const employeeNo = `EMP-${Date.now().toString().slice(-6)}`;
    try {
      const employee = await upsertHrEmployee({
        company_id: activeCompanyId,
        created_by_user_id: user.id as UUID,
        employee_no: employeeNo,
        first_name: firstName || 'Unknown',
        last_name: lastName,
        email: String(row.email ?? `${employeeNo.toLowerCase()}@pending.local`),
        employment_type: 'Permanent',
        start_date: new Date().toISOString().slice(0, 10),
        employment_status: 'ONBOARDING'
      });
      await updateHrRecord('hr_applicants', {
        companyId: activeCompanyId,
        rowId: row.id as UUID,
        actorUserId: user.id as UUID,
        patch: {
          converted_employee_id: employee.id,
          status: 'HIRED'
        }
      });
      await refetchApplicants();
      setSuccess('Employee saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to convert applicant to employee right now.'));
    }
  }

  async function onDeleteRecord(table: 'hr_vacancies' | 'hr_applicants', rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    const confirmed = window.confirm('Are you sure you want to delete this record?');
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteHrRecord(table, {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID
      });
      if (table === 'hr_vacancies') {
        await refetchVacancies();
        if (vacancyIdForApplicant === String(rowId)) setVacancyIdForApplicant('');
      } else {
        await refetchApplicants();
      }
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete this record right now.'));
    }
  }

  return (
    <Layout title="Recruitment & Selection">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Created from</span>
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Created to</span>
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </label>
            {(filterDateFrom || filterDateTo) && (
              <div className="flex items-center gap-2 text-xs text-charcoal-500">
                <span>Date filter active (applies to vacancies and applicants)</span>
                <button type="button" className="text-teal underline" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}>Clear</button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Vacancy Management</h3>
            <div className="space-y-3">
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" autoComplete="off" value={vacancyTitle} onChange={(e) => setVacancyTitle(e.target.value)} placeholder="Open vacancy title" />
              <textarea className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm min-h-[100px]" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Job description (rich text supported as plain text input)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">
                    <span className="block text-xs text-charcoal-500 mb-1">Competencies required</span>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm"
                        autoComplete="off"
                        value={competencyInput}
                        onChange={(e) => setCompetencyInput(e.target.value)}
                        placeholder="Type a competency and press Add"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = competencyInput.trim();
                            if (val && !competenciesRequired.includes(val)) {
                              setCompetenciesRequired((prev) => [...prev, val]);
                            }
                            setCompetencyInput('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                        onClick={() => {
                          const val = competencyInput.trim();
                          if (val && !competenciesRequired.includes(val)) {
                            setCompetenciesRequired((prev) => [...prev, val]);
                          }
                          setCompetencyInput('');
                        }}
                      >Add</button>
                    </div>
                  </label>
                  {competenciesRequired.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {competenciesRequired.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal/10 text-teal text-xs font-medium">
                          {c}
                          <button
                            type="button"
                            className="hover:text-critical"
                            onClick={() => setCompetenciesRequired((prev) => prev.filter((x) => x !== c))}
                            aria-label={`Remove ${c}`}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <label className="text-sm">
                  <span className="block text-xs text-charcoal-500 mb-1">Experience required</span>
                  <select
                    className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                    value={experienceRequired}
                    onChange={(e) => setExperienceRequired(e.target.value)}
                  >
                    <option value="">Select experience level</option>
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={referenceChecksDone} onChange={(e) => setReferenceChecksDone(e.target.checked)} />
                Reference checks done
              </label>
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreateVacancy()} disabled={!canWrite}>
                Create Vacancy
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-surface-100 pt-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Search</span>
                <input className="w-44 border border-surface-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Vacancy title" value={vacancyQuery} onChange={(e) => setVacancyQuery(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Status</span>
                <select className="border border-surface-300 rounded-lg px-3 py-1.5 text-sm" value={vacancyStatusFilter} onChange={(e) => setVacancyStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  {vacancyStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {vacancyFiltersActiveCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-charcoal-500">
                  <span>{vacancyFiltersActiveCount} filter{vacancyFiltersActiveCount === 1 ? '' : 's'} active</span>
                  <button type="button" className="text-teal underline" onClick={() => { setVacancyQuery(''); setVacancyStatusFilter(''); }}>Clear filters</button>
                </div>
              )}
              <HrExportMenu
                moduleName="Vacancies"
                periodLabel={filterDateFrom || filterDateTo ? `${filterDateFrom || 'earliest'} to ${filterDateTo || 'latest'}` : undefined}
                fileNameBase={`SCA_Recruitment_Vacancies_${new Date().toISOString().slice(0, 10)}`}
                columns={[
                  { key: 'title', label: 'Title' },
                  { key: 'status', label: 'Status' },
                  { key: 'experience_required', label: 'Experience Required' },
                  { key: 'reference_checks_done', label: 'Reference Checks Done' },
                  { key: 'department_manager_approved', label: 'Department Manager Approved' }
                ]}
                rows={filteredVacancies.map((row) => ({
                  title: row.title,
                  status: row.status,
                  experience_required: row.experience_required,
                  reference_checks_done: row.reference_checks_done,
                  department_manager_approved: row.department_manager_approved
                }))}
              />
            </div>
            <div className="space-y-2 text-sm">
              {vacanciesLoading ? (
                <div className="flex justify-center py-6"><LoadingSpinner /></div>
              ) : filteredVacancies.length === 0 ? (
                <p className="text-sm text-charcoal-500 py-4 text-center">No vacancies match your filters.</p>
              ) : filteredVacancies.map((row) => (
                <div key={String(row.id)} id={`vacancy-${String(row.id)}`} className="border border-surface-200 rounded-lg p-3">
                  <p className="font-medium">{String(row.title ?? '')}</p>
                  <p className="text-charcoal-500">
                    {((row.competencies_required as string[] | undefined)?.length
                      ? (row.competencies_required as string[]).join(', ')
                      : String(row.competency_required ?? '-')
                    )} | {String(row.experience_required ?? '-')}
                  </p>
                  <p className="text-charcoal-500">Dept approval: {String(Boolean(row.department_manager_approved))} | Ref checks: {String(Boolean(row.reference_checks_done))}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canDepartmentManagerApprove && !row.department_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveVacancyAsDepartmentManager(row.id as UUID)}>Approve (Department Manager)</button>
                    )}
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void setReferenceChecked(row.id as UUID, !row.reference_checks_done)}>
                        Reference checks: {row.reference_checks_done ? 'Yes' : 'No'}
                      </button>
                    )}
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-critical/40 text-critical" onClick={() => void onDeleteRecord('hr_vacancies', row.id as UUID)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Applicant Management</h3>
            <div className="space-y-3">
              <select className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={vacancyIdForApplicant} onChange={(e) => setVacancyIdForApplicant(e.target.value)}>
                <option value="">Select vacancy (optional)</option>
                {(vacancies ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.title ?? '')}</option>)}
              </select>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" autoComplete="off" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Applicant name" />
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" autoComplete="off" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} placeholder="Applicant email" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">Interviewed & met requirements?
                  <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={interviewedMetRequirements === null ? '' : interviewedMetRequirements ? 'yes' : 'no'} onChange={(e) => setInterviewedMetRequirements(e.target.value === '' ? null : e.target.value === 'yes')}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="text-sm">Offer accepted?
                  <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={offerAccepted === null ? '' : offerAccepted ? 'yes' : 'no'} onChange={(e) => setOfferAccepted(e.target.value === '' ? null : e.target.value === 'yes')}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" autoComplete="off" value={leavingReason} onChange={(e) => setLeavingReason(e.target.value)} placeholder="Reason for leaving previous employer" />
              <label className="text-sm">Criminal record?
                <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={criminalRecord === null ? '' : criminalRecord ? 'yes' : 'no'} onChange={(e) => setCriminalRecord(e.target.value === '' ? null : e.target.value === 'yes')}>
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreateApplicant()} disabled={!canWrite}>
                Add Applicant
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-surface-100 pt-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Search</span>
                <input className="w-44 border border-surface-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Name or vacancy" value={applicantQuery} onChange={(e) => setApplicantQuery(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Status</span>
                <select className="border border-surface-300 rounded-lg px-3 py-1.5 text-sm" value={applicantStatusFilter} onChange={(e) => setApplicantStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  {applicantStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {applicantFiltersActiveCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-charcoal-500">
                  <span>{applicantFiltersActiveCount} filter{applicantFiltersActiveCount === 1 ? '' : 's'} active</span>
                  <button type="button" className="text-teal underline" onClick={() => { setApplicantQuery(''); setApplicantStatusFilter(''); }}>Clear filters</button>
                </div>
              )}
              <HrExportMenu
                moduleName="Applicants"
                periodLabel={filterDateFrom || filterDateTo ? `${filterDateFrom || 'earliest'} to ${filterDateTo || 'latest'}` : undefined}
                fileNameBase={`SCA_Recruitment_Applicants_${new Date().toISOString().slice(0, 10)}`}
                columns={[
                  { key: 'full_name', label: 'Full Name' },
                  { key: 'vacancy', label: 'Vacancy' },
                  { key: 'status', label: 'Status' },
                  { key: 'interviewed_met_requirements', label: 'Met Requirements' },
                  { key: 'offer_accepted', label: 'Offer Accepted' },
                  { key: 'criminal_record', label: 'Criminal Record' }
                ]}
                rows={filteredApplicants.map((row) => ({
                  full_name: row.full_name,
                  vacancy: vacancyMap.get(row.vacancy_id as UUID) ?? row.vacancy_id,
                  status: row.status,
                  interviewed_met_requirements: row.interviewed_met_requirements,
                  offer_accepted: row.offer_accepted,
                  criminal_record: row.criminal_record
                }))}
              />
            </div>
            <div className="space-y-2 text-sm">
              {applicantsLoading ? (
                <div className="flex justify-center py-6"><LoadingSpinner /></div>
              ) : filteredApplicants.length === 0 ? (
                <p className="text-sm text-charcoal-500 py-4 text-center">No applicants match your filters.</p>
              ) : filteredApplicants.map((row) => (
                <div key={String(row.id)} id={`applicant-${String(row.id)}`} className="border border-surface-200 rounded-lg p-3">
                  <p className="font-medium">{String(row.full_name ?? '')}</p>
                  <p className="text-charcoal-500">Vacancy: {row.vacancy_id ? String(vacancyMap.get(row.vacancy_id as UUID) ?? row.vacancy_id) : '-'}</p>
                  <p className="text-charcoal-500">Interviewed+Met: {String(row.interviewed_met_requirements ?? '-')} | Offer accepted: {String(row.offer_accepted ?? '-')}</p>
                  <p className="text-charcoal-500">HR approval: {String(Boolean(row.hr_manager_approved))} | Department approval: {String(Boolean(row.department_manager_approved))}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canHrManagerApprove && !row.hr_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveApplicant(row.id as UUID, 'hr')}>Approve (HR Manager)</button>
                    )}
                    {canDepartmentManagerApprove && !row.department_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveApplicant(row.id as UUID, 'dept')}>Approve (Department Manager)</button>
                    )}
                    <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void convertApplicantToEmployee(row)}>
                      Convert to Employee
                    </button>
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-critical/40 text-critical" onClick={() => void onDeleteRecord('hr_applicants', row.id as UUID)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}

