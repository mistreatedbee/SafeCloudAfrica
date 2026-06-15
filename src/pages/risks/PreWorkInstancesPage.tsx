import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { ClipboardCheckIcon } from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';

import { listPreWorkInstances } from '../../api/services/risksService';
import {
  listRiskAssessments,
  type MembershipScope,
  type RiskAssessment
} from '../../api/services/riskAssessmentsService';
import type { UUID } from '../../api/models/core';

function getScopeForActiveMembership(
  memberships: Array<{ company_id: UUID; site_id?: UUID | null; department_id?: UUID | null; consultant_scope?: any }> | undefined,
  companyId: UUID | null
): MembershipScope | null {
  if (!memberships || !companyId) return null;
  const active = memberships.find((m) => m.company_id === companyId);
  if (!active) return null;
  return {
    siteId: active.site_id ?? null,
    departmentId: active.department_id ?? null,
    consultantScope: active.consultant_scope ?? null
  };
}

export function PreWorkInstancesPage() {
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const { user } = useUser();
  const [instances, setInstances] = useState<Array<{ id: string; risk_assessment_id: string; instance_date: string; supervisor_signed_at: string | null }>>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      listPreWorkInstances({ companyId: activeCompanyId }),
      listRiskAssessments({
        companyId: activeCompanyId as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope,
        type: 'prework',
        limit: 500
      })
    ])
      .then(([instanceRows, assessmentRows]) => {
        setInstances(instanceRows as never);
        setAssessments(assessmentRows);
      })
      .catch((e: unknown) => {
        setError(toUserFacingError(e, 'Failed to load pre-work instances'));
        setInstances([]);
        setAssessments([]);
      })
      .finally(() => setLoading(false));
  }, [activeCompanyId, activeRole, scope, user?.id]);

  const assessmentMap = useMemo(
    () => new Map(assessments.map((assessment) => [String(assessment.id), assessment])),
    [assessments]
  );

  const visibleInstances = useMemo(
    () => instances.filter((instance) => assessmentMap.has(String(instance.risk_assessment_id))),
    [assessmentMap, instances]
  );

  return (
    <Layout title="Pre-work Daily Instances">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pre-work Daily Instances</h1>
        <p className="text-gray-600 mb-6">
          View daily pre-work risk assessment instances by date. Each instance shows employee signatures and supervisor sign-off.
        </p>
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        {loading ? (
          <div className="text-center py-8 text-sm text-charcoal-500">Loading…</div>
        ) : visibleInstances.length === 0 ? (
          <ListEmptyState
            icon={ClipboardCheckIcon}
            title="No pre-work instances yet"
            description="Daily pre-work sign-offs appear here once employees complete instances linked to a pre-work assessment you can access."
            primaryAction={{ kind: 'link', to: '/risk-assessments/new?type=prework', label: 'Create pre-work assessment' }}
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assessment</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Supervisor sign-off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleInstances.map((inst) => {
                  const assessment = assessmentMap.get(String(inst.risk_assessment_id));
                  return (
                  <tr key={inst.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{inst.instance_date}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link to={`/risk-assessments/${inst.risk_assessment_id}`} className="text-blue-600 hover:underline">
                        {assessment?.title ?? 'View assessment'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{assessment?.reference ?? '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {inst.supervisor_signed_at ? new Date(inst.supervisor_signed_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link to="/risk-assessments" className="text-gray-600 hover:text-gray-900 text-sm">Back to Risk Assessments</Link>
        </div>
      </div>
    </Layout>
  );
}
