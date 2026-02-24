import React, { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, listHrRecords } from '../../api/services/hrService';

export function HrRecruitmentPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [vacancyTitle, setVacancyTitle] = useState('');
  const [applicantName, setApplicantName] = useState('');

  const { data: vacancies, refetch: refetchVacancies } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_vacancies');
  }, [activeCompanyId]);

  const { data: applicants, refetch: refetchApplicants } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_applicants');
  }, [activeCompanyId]);

  const onCreateVacancy = async () => {
    if (!activeCompanyId || !user?.id || !vacancyTitle) return;
    await createHrRecord('hr_vacancies', { company_id: activeCompanyId, title: vacancyTitle, status: 'OPEN', created_by_user_id: user.id });
    setVacancyTitle('');
    await refetchVacancies();
  };

  const onCreateApplicant = async () => {
    if (!activeCompanyId || !user?.id || !applicantName) return;
    await createHrRecord('hr_applicants', { company_id: activeCompanyId, full_name: applicantName, status: 'NEW', cv_file_ids: [], created_by_user_id: user.id });
    setApplicantName('');
    await refetchApplicants();
  };

  return (
    <Layout title="Recruitment & Selection">
      <div className="space-y-4">
        <HrSectionNav />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Vacancies</h3>
            <div className="flex gap-2">
              <input className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm" value={vacancyTitle} onChange={(e) => setVacancyTitle(e.target.value)} placeholder="Vacancy title" />
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreateVacancy}>Add</button>
            </div>
            <ul className="space-y-2 text-sm">
              {(vacancies ?? []).map((row) => <li key={row.id} className="border border-surface-200 rounded-lg px-3 py-2">{String(row.title ?? '')} - {String(row.status ?? '')}</li>)}
            </ul>
          </div>

          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Applicants</h3>
            <div className="flex gap-2">
              <input className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Applicant name" />
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreateApplicant}>Add</button>
            </div>
            <ul className="space-y-2 text-sm">
              {(applicants ?? []).map((row) => <li key={row.id} className="border border-surface-200 rounded-lg px-3 py-2">{String(row.full_name ?? '')} - {String(row.status ?? '')}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
