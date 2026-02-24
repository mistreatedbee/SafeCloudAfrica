import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { useParams } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { canViewRestrictedFields, getEmployeeIntegratedProfile, logRestrictedFieldAccess } from '../../api/services/hrService';

const TABS = ['overview', 'documents', 'contracts', 'leave', 'hours', 'performance', 'disciplinary', 'training', 'audit'] as const;

type Tab = (typeof TABS)[number];

export function HrEmployeeProfilePage() {
  const { id } = useParams();
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: canRestricted } = useAsync(async () => {
    if (!activeCompanyId) return false;
    return canViewRestrictedFields(activeCompanyId);
  }, [activeCompanyId]);

  const { data: payload } = useAsync(async () => {
    if (!activeCompanyId || !id) return null;
    return getEmployeeIntegratedProfile(activeCompanyId, id);
  }, [activeCompanyId, id]);

  const employee = payload?.employee as Record<string, unknown> | undefined;

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

  const onRestrictedView = async (field: string) => {
    if (!activeCompanyId || !user?.id || !id) return;
    await logRestrictedFieldAccess({ companyId: activeCompanyId, actorUserId: user.id, targetEntity: 'hr_employee', targetId: id, fieldName: field, action: 'view' });
  };

  return (
    <Layout title="Employee Profile">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          {!employee ? <p className="text-sm text-charcoal-500">Employee not found.</p> : (
            <>
              <h2 className="text-xl font-semibold text-charcoal">{String(employee.first_name)} {String(employee.last_name)}</h2>
              <p className="text-sm text-charcoal-500">Employee No: {String(employee.employee_no)} | Status: {String(employee.employment_status)}</p>
            </>
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
              <Line label="Next Review" value={employee.next_review_date} />
            </Card>
            <Card title="Restricted (POPIA)">
              {restricted.map((item) => (
                <div key={item.key} className="flex items-center justify-between border-b border-surface-100 py-2 text-sm">
                  <span className="text-charcoal-500">{item.key}</span>
                  {canRestricted ? (
                    <button className="text-teal" onClick={() => onRestrictedView(item.key)}>{String(item.value ?? '-')}</button>
                  ) : (
                    <span className="text-charcoal-300">Restricted</span>
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab !== 'overview' && (
          <Card title={tab}>
            <pre className="text-xs overflow-auto max-h-[480px]">{JSON.stringify(payload?.[mapTab(tab)] ?? [], null, 2)}</pre>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function mapTab(tab: Tab): string {
  if (tab === 'documents') return 'documents';
  if (tab === 'contracts') return 'contracts';
  if (tab === 'leave') return 'leaveRequests';
  if (tab === 'hours') return 'timesheets';
  if (tab === 'performance') return 'performance';
  if (tab === 'disciplinary') return 'disciplinary';
  if (tab === 'training') return 'trainingRecords';
  return 'auditTrail';
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-surface-300 rounded-xl p-4"><h3 className="text-sm font-semibold mb-2">{title}</h3>{children}</div>;
}

function Line({ label, value }: { label: string; value: unknown }) {
  return <div className="flex justify-between border-b border-surface-100 py-2 text-sm"><span className="text-charcoal-500">{label}</span><span>{String(value ?? '-')}</span></div>;
}
