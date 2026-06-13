import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createHrRecord,
  getHrSettings,
  listHrEmployees,
  listHrManagersAndAdmins,
  listHrRecords,
  recommendDisciplinaryAction,
  updateHrRecord
} from '../../api/services/hrService';
import { createNotification } from '../../api/services/notificationsService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';
import type { UUID } from '../../api/models/core';
import { downloadTextFile, toCsv } from '../../utils/csv';
import { toUserFacingError } from '../../utils/userFacingMessage';

type SeverityFlag = 'minor' | 'major' | 'repeat';

const OFFENCE_OPTIONS = [
  'Absenteeism',
  'Insubordination',
  'Negligence',
  'Harassment',
  'Theft/Fraud',
  'Safety non-compliance',
  'Damage to property'
].map((value) => ({ id: value, value, label: value }));

const CASE_TYPE_OPTIONS = [
  'Verbal Warning',
  'Written Warning',
  'Final Warning',
  'Suspension',
  'Hearing',
  'Dismissal'
].map((value) => ({ id: value, value, label: value }));

function severityFromHistory(repeatCount: number, caseType: string): SeverityFlag {
  if (repeatCount > 0) return 'repeat';
  const ct = caseType.trim().toLowerCase();
  if (ct.includes('final') || ct.includes('dismiss') || ct.includes('suspension') || ct.includes('hearing')) return 'major';
  return 'minor';
}

export function HrLabourPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [caseType, setCaseType] = useState('Written Warning');
  const [offenceType, setOffenceType] = useState('Absenteeism');
  const [description, setDescription] = useState('');
  const [disciplinaryActionTaken, setDisciplinaryActionTaken] = useState('');
  const [repeatOffenceAction, setRepeatOffenceAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<UUID | null>(null);
  const [evidenceCaseId, setEvidenceCaseId] = useState<UUID | null>(null);
  const [selectedCaseDraft, setSelectedCaseDraft] = useState<{
    status: string;
    description: string;
    disciplinaryActionTaken: string;
    repeatOffenceAction: string;
    recommendedAction: string;
    offenceSeverity: string;
  }>({
    status: 'OPEN',
    description: '',
    disciplinaryActionTaken: '',
    repeatOffenceAction: '',
    recommendedAction: '',
    offenceSeverity: ''
  });

  const { data: settings } = useAsync(async () => {
    if (!activeCompanyId) return null;
    return getHrSettings(activeCompanyId);
  }, [activeCompanyId]);

  const repeatWindowMonths = Number(settings?.repeat_offence_window_months ?? 6);

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: cases, loading: casesLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_disciplinary_cases');
  }, [activeCompanyId]);

  const employeeLabel = useMemo(
    () => new Map((employees ?? []).map((row) => [row.id as UUID, `${row.first_name} ${row.last_name} (${row.employee_no})`])),
    [employees]
  );

  const repeatCount = useMemo(() => {
    if (!employeeId) return 0;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - repeatWindowMonths, now.getDate());
    return (cases ?? []).filter((row) => {
      if (String(row.employee_id ?? '') !== employeeId) return false;
      if (String(row.offence_type ?? row.offence_category ?? '').trim().toLowerCase() !== offenceType.trim().toLowerCase()) return false;
      const issued = new Date(String(row.date_issued ?? row.created_at ?? ''));
      return !Number.isNaN(issued.getTime()) && issued >= cutoff;
    }).length;
  }, [cases, employeeId, offenceType, repeatWindowMonths]);

  const severity = severityFromHistory(repeatCount, caseType);
  const recommended = recommendDisciplinaryAction({ repeatCount, caseType });
  const selectedCase = (cases ?? []).find((row) => row.id === selectedCaseId) ?? null;

  React.useEffect(() => {
    if (!selectedCase) return;
    setSelectedCaseDraft({
      status: String(selectedCase.status ?? 'OPEN'),
      description: String(selectedCase.description ?? ''),
      disciplinaryActionTaken: String(selectedCase.disciplinary_action_taken ?? ''),
      repeatOffenceAction: String(selectedCase.repeat_offence_action ?? ''),
      recommendedAction: String(selectedCase.recommended_action ?? ''),
      offenceSeverity: String(selectedCase.offence_severity ?? '')
    });
  }, [selectedCase]);

  function openCaseDetails(row: Record<string, unknown>) {
    setSelectedCaseId(row.id as UUID);
    setSelectedCaseDraft({
      status: String(row.status ?? 'OPEN'),
      description: String(row.description ?? ''),
      disciplinaryActionTaken: String(row.disciplinary_action_taken ?? ''),
      repeatOffenceAction: String(row.repeat_offence_action ?? ''),
      recommendedAction: String(row.recommended_action ?? ''),
      offenceSeverity: String(row.offence_severity ?? '')
    });
    setError(null);
    setSuccess(null);
  }

  async function onCreate() {
    if (!activeCompanyId || !user?.id || !employeeId || !description.trim() || !offenceType.trim()) {
      setError('Employee, offence type, and offence description are required.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const created = await createHrRecord('hr_disciplinary_cases', {
        company_id: activeCompanyId,
        employee_id: employeeId,
        case_type: caseType,
        offence_type: offenceType.trim(),
        offence_category: offenceType.trim(),
        description: description.trim(),
        disciplinary_action_taken: disciplinaryActionTaken.trim() || null,
        repeat_offence_action: repeatOffenceAction.trim() || null,
        recommended_action: recommended,
        offence_severity: severity,
        warning_level: caseType,
        date_issued: new Date().toISOString().slice(0, 10),
        evidence_file_ids: [],
        repeat_offence_flag: severity === 'repeat',
        status: 'OPEN',
        created_by_user_id: user.id
      });
      if (severity === 'repeat') {
        const recipients = await listHrManagersAndAdmins(activeCompanyId).catch(() => []);
        for (const recipientId of recipients) {
          await createNotification(
            activeCompanyId,
            recipientId,
            'warning',
            'Repeat offence flagged',
            `Employee ${employeeLabel.get(employeeId as UUID) ?? employeeId} has a repeat offence case logged.`,
            { module: 'hr', route: '/dashboard/hr/labour', caseId: created.id }
          ).catch(() => undefined);
        }
      }
      setDescription('');
      setDisciplinaryActionTaken('');
      setRepeatOffenceAction('');
      await refetch();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save this labour case right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSelected() {
    if (!activeCompanyId || !user?.id || !selectedCase) return;
    setError(null);
    setSuccess(null);
    try {
      await updateHrRecord('hr_disciplinary_cases', {
        companyId: activeCompanyId,
        rowId: selectedCase.id as UUID,
        actorUserId: user.id as UUID,
        patch: {
          status: selectedCaseDraft.status,
          description: selectedCaseDraft.description.trim() || null,
          disciplinary_action_taken: selectedCaseDraft.disciplinaryActionTaken.trim() || null,
          repeat_offence_action: selectedCaseDraft.repeatOffenceAction.trim() || null,
          recommended_action: selectedCaseDraft.recommendedAction.trim() || null,
          offence_severity: selectedCaseDraft.offenceSeverity.trim() || null
        }
      });
      await refetch();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update this labour case right now.'));
    }
  }

  const onExport = () => {
    const csv = toCsv((cases ?? []).map((row) => ({
      id: row.id,
      employee: employeeLabel.get(row.employee_id as UUID) ?? row.employee_id,
      offence_type: row.offence_type ?? row.offence_category,
      description: row.description,
      disciplinary_action_taken: row.disciplinary_action_taken,
      repeat_offence_action: row.repeat_offence_action,
      recommended_action: row.recommended_action,
      offence_severity: row.offence_severity,
      repeat_offence_flag: row.repeat_offence_flag,
      status: row.status,
      date_issued: row.date_issued
    })));
    downloadTextFile(`hr-offence-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Layout title="Labour Relations & Compliance">
      <div className="space-y-4">
        <HrSectionNav />
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Employee Offence Log</h3>
          {error && <p className="text-sm text-critical">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <HrEmployeeSelect
                companyId={activeCompanyId ?? null}
                value={employeeId as any}
                valueField="id"
                includeUnlinked={true}
                onChange={(val) => setEmployeeId(val)}
                label="Employee"
                placeholder="Search employee..."
                disabled={!canManage}
              />
            </div>
            <SelectOrType
              label="Offence type"
              value={offenceType}
              onChange={(value) => setOffenceType(value)}
              options={OFFENCE_OPTIONS}
              companyId={activeCompanyId ?? undefined}
              moduleKey="hr"
              fieldKey="offence_type"
              createdByUserId={user?.id as UUID | undefined}
              allowCreate={!!activeCompanyId}
              disabled={!canManage}
            />
            <SelectOrType
              label="Case / action type"
              value={caseType}
              onChange={(value) => setCaseType(value)}
              options={CASE_TYPE_OPTIONS}
              companyId={activeCompanyId ?? undefined}
              moduleKey="hr"
              fieldKey="disciplinary_case_type"
              createdByUserId={user?.id as UUID | undefined}
              allowCreate={!!activeCompanyId}
              disabled={!canManage}
            />
            <label className="text-sm md:col-span-3">
              <span className="block text-xs text-charcoal-500 mb-1">Description of offence</span>
              <textarea className="w-full border border-surface-300 rounded-lg px-3 py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Disciplinary action taken</span>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={disciplinaryActionTaken} onChange={(e) => setDisciplinaryActionTaken(e.target.value)} disabled={!canManage} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Action for repeat offence</span>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={repeatOffenceAction} onChange={(e) => setRepeatOffenceAction(e.target.value)} disabled={!canManage} />
            </label>
            <div className={`text-sm rounded-lg border p-3 ${severity === 'repeat' ? 'border-critical bg-critical/5' : 'border-surface-200 bg-surface-50'}`}>
              <p>Severity: <span className={`font-semibold uppercase ${severity === 'repeat' ? 'text-critical' : ''}`}>{severity}</span></p>
              <p>Related cases in {repeatWindowMonths} months: <span className={`font-semibold ${repeatCount > 0 ? 'text-critical' : ''}`}>{repeatCount}</span></p>
              <p className="mt-1">Recommended action: <span className="font-medium">{recommended}</span></p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onCreate()} disabled={!canManage || saving}>
              {saving ? 'Saving...' : 'Report Offence / Log Case'}
            </button>
            <button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={onExport}>Export CSV</button>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          {casesLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : (cases ?? []).length === 0 ? (
            <div className="text-center py-10 text-sm text-charcoal-500">No labour cases yet.</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-100">
              <tr>
                <th className="text-left px-3 py-2">Employee</th>
                <th className="text-left px-3 py-2">Offence type</th>
                <th className="text-left px-3 py-2">Severity</th>
                <th className="text-left px-3 py-2">Repeat</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(cases ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? String(row.employee_id ?? '')}</td>
                  <td className="px-3 py-2">{String(row.offence_type ?? row.offence_category ?? '')}</td>
                  <td className="px-3 py-2">{String(row.offence_severity ?? '-')}</td>
                  <td className="px-3 py-2">
                    {row.repeat_offence_flag ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300 text-xs font-semibold shadow-sm">
                        Repeat offence
                      </span>
                    ) : (
                      'No'
                    )}
                  </td>
                  <td className="px-3 py-2">{String(row.status ?? '')}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="text-teal font-medium hover:underline" onClick={() => openCaseDetails(row)}>View details</button>
                      <button className="text-charcoal-700 font-medium hover:underline" onClick={() => setEvidenceCaseId(row.id as UUID)}>Warnings/Evidence</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {selectedCase && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Offence case details</h4>
              <button className="text-sm text-charcoal-500" onClick={() => setSelectedCaseId(null)}>Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <p><span className="text-charcoal-500">Employee:</span> {employeeLabel.get(selectedCase.employee_id as UUID) ?? String(selectedCase.employee_id)}</p>
              <p><span className="text-charcoal-500">Offence:</span> {String(selectedCase.offence_type ?? selectedCase.offence_category ?? '')}</p>
              {selectedCase.repeat_offence_flag && (
                <div className="md:col-span-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-300 text-xs font-semibold">
                    Repeat offence
                  </span>
                </div>
              )}
              <label className="md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Description</span>
                <textarea
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  rows={3}
                  value={selectedCaseDraft.description}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <label>
                <span className="block text-xs text-charcoal-500 mb-1">Disciplinary action taken</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={selectedCaseDraft.disciplinaryActionTaken}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, disciplinaryActionTaken: e.target.value }))}
                />
              </label>
              <label>
                <span className="block text-xs text-charcoal-500 mb-1">Action for repeat offence</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={selectedCaseDraft.repeatOffenceAction}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, repeatOffenceAction: e.target.value }))}
                />
              </label>
              <label>
                <span className="block text-xs text-charcoal-500 mb-1">Recommended action</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={selectedCaseDraft.recommendedAction}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, recommendedAction: e.target.value }))}
                />
              </label>
              <label>
                <span className="block text-xs text-charcoal-500 mb-1">Offence severity</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={selectedCaseDraft.offenceSeverity}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, offenceSeverity: e.target.value }))}
                />
              </label>
              <label>
                <span className="block text-xs text-charcoal-500 mb-1">Status</span>
                <select
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={selectedCaseDraft.status}
                  onChange={(e) => setSelectedCaseDraft((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
            </div>
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onSaveSelected()} disabled={!canManage}>
              Save updates
            </button>
            <button className="ml-2 px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => setEvidenceCaseId(selectedCase.id as UUID)}>
              Attach warnings/evidence
            </button>
          </div>
        )}
        {activeCompanyId && user?.id && evidenceCaseId && (
          <EvidenceModal
            open={Boolean(evidenceCaseId)}
            onClose={() => setEvidenceCaseId(null)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="hr_disciplinary_case"
            entityId={evidenceCaseId}
          />
        )}
      </div>
    </Layout>
  );
}
