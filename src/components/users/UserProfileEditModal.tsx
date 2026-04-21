import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Department, Site, UserProfile, UUID } from '../../api/models/entities';
import { adminUpdateEmployeeNumber, upsertUserProfileAsManager } from '../../api/services/profilesService';
import { useAsync } from '../../api/hooks/useAsync';
import { listSites } from '../../api/services/sitesService';
import { listDepartments } from '../../api/services/departmentsService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function UserProfileEditModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  userId: UUID;
  initial?: UserProfile | null;
  canEditEmployeeId?: boolean;
  onSaved?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `user-profile-edit:${props.companyId}:${props.userId}`;
  const [fullName, setFullName] = useState(props.initial?.full_name ?? '');
  const [email, setEmail] = useState(props.initial?.email ?? '');
  const [phone, setPhone] = useState(props.initial?.phone ?? '');
  const [department, setDepartment] = useState(props.initial?.department ?? '');
  const [site, setSite] = useState(props.initial?.site ?? '');
  const [siteId, setSiteId] = useState<string>(String(props.initial?.site_id ?? ''));
  const [departmentId, setDepartmentId] = useState<string>(String(props.initial?.department_id ?? ''));
  const [employeeNumber, setEmployeeNumber] = useState(props.initial?.employee_number ?? '');
  const [editEmployeeNumber, setEditEmployeeNumber] = useState(false);
  const [employeeNumberDraft, setEmployeeNumberDraft] = useState(props.initial?.employee_number ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sites } = useAsync<Site[]>(async () => listSites(props.companyId), [props.companyId]);
  const { data: departments } = useAsync<Department[]>(async () => listDepartments(props.companyId), [props.companyId]);

  const canSubmit = useMemo(() => fullName.trim().length > 1 || email.trim().length > 3, [email, fullName]);
  const canSubmitEmployeeNumber = !!(props.canEditEmployeeId && editEmployeeNumber && employeeNumberDraft.trim());
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (
        fullName !== (props.initial?.full_name ?? '') ||
        email !== (props.initial?.email ?? '') ||
        phone !== (props.initial?.phone ?? '') ||
        department !== (props.initial?.department ?? '') ||
        site !== (props.initial?.site ?? '') ||
        siteId !== String(props.initial?.site_id ?? '') ||
        departmentId !== String(props.initial?.department_id ?? '') ||
        employeeNumberDraft !== (props.initial?.employee_number ?? '') ||
        editEmployeeNumber
      ),
    [
      department,
      departmentId,
      editEmployeeNumber,
      email,
      employeeNumberDraft,
      fullName,
      phone,
      props.initial?.department,
      props.initial?.department_id,
      props.initial?.email,
      props.initial?.employee_number,
      props.initial?.full_name,
      props.initial?.phone,
      props.initial?.site,
      props.initial?.site_id,
      props.open,
      site,
      siteId
    ]
  );

  useDraftRegistration({
    key: draftKey,
    label: 'User Profile Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'hr',
      formType: 'user-profile-edit',
      linkedRecordId: props.userId
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      fullName,
      email,
      phone,
      department,
      site,
      siteId,
      departmentId,
      employeeNumber,
      employeeNumberDraft,
      editEmployeeNumber
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      fullName?: string;
      email?: string;
      phone?: string;
      department?: string;
      site?: string;
      siteId?: string;
      departmentId?: string;
      employeeNumber?: string;
      employeeNumberDraft?: string;
      editEmployeeNumber?: boolean;
    }>(draftKey);

    if (restored) {
      setFullName(restored.fullName ?? '');
      setEmail(restored.email ?? '');
      setPhone(restored.phone ?? '');
      setDepartment(restored.department ?? '');
      setSite(restored.site ?? '');
      setSiteId(restored.siteId ?? '');
      setDepartmentId(restored.departmentId ?? '');
      setEmployeeNumber(restored.employeeNumber ?? (props.initial?.employee_number ?? ''));
      setEmployeeNumberDraft(restored.employeeNumberDraft ?? (props.initial?.employee_number ?? ''));
      setEditEmployeeNumber(restored.editEmployeeNumber ?? false);
      return;
    }

    setFullName(props.initial?.full_name ?? '');
    setEmail(props.initial?.email ?? '');
    setPhone(props.initial?.phone ?? '');
    setDepartment(props.initial?.department ?? '');
    setSite(props.initial?.site ?? '');
    setSiteId(String(props.initial?.site_id ?? ''));
    setDepartmentId(String(props.initial?.department_id ?? ''));
    setEmployeeNumber(props.initial?.employee_number ?? '');
    setEmployeeNumberDraft(props.initial?.employee_number ?? '');
    setEditEmployeeNumber(false);
  }, [draftKey, props.initial, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);

      if (canSubmitEmployeeNumber && employeeNumberDraft.trim() !== employeeNumber.trim()) {
        const updated = await adminUpdateEmployeeNumber({
          companyId: props.companyId,
          userId: props.userId,
          employeeNumber: employeeNumberDraft.trim()
        });
        setEmployeeNumber(updated);
        setEmployeeNumberDraft(updated);
        setEditEmployeeNumber(false);
      }

      await upsertUserProfileAsManager({
        companyId: props.companyId,
        userId: props.userId,
        fullName: fullName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        siteId: siteId ? (siteId as any) : null,
        departmentId: departmentId ? (departmentId as any) : null,
        department: department.trim() || null,
        site: site.trim() || null
      });
      clearDraft(draftKey);
      props.onSaved?.();
      props.onClose();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Edit user profile</p>
            <p className="text-xs text-charcoal-500 mt-0.5">User: {String(props.userId).slice(0, 8)}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee ID</label>
              <div className="flex items-center gap-2">
                <input
                  value={editEmployeeNumber ? employeeNumberDraft : employeeNumber}
                  onChange={(e) => setEmployeeNumberDraft(e.target.value)}
                  readOnly={!editEmployeeNumber}
                  placeholder="Auto-generated"
                  className={`w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent ${
                    !editEmployeeNumber ? 'text-charcoal-600 bg-surface-50' : ''
                  }`}
                />
                {!!props.canEditEmployeeId && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !editEmployeeNumber;
                      setEditEmployeeNumber(next);
                      setEmployeeNumberDraft(employeeNumber);
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                  >
                    {editEmployeeNumber ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>
              {editEmployeeNumber && (
                <p className="text-xs text-charcoal-400 mt-1">
                  Format: <span className="font-semibold">ORG-ROLE-0001</span> (e.g. <span className="font-semibold">SCA-EMP-0007</span>)
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Department</label>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  const selected = (departments ?? []).find((d) => String(d.id) === e.target.value);
                  if (selected) setDepartment(selected.name);
                }}
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
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Site</label>
            <select
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                const selected = (sites ?? []).find((s) => String(s.id) === e.target.value);
                if (selected) setSite(selected.name);
              }}
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
            <p className="text-xs text-charcoal-400 mt-1">
              If your company hasn’t set up sites/departments yet, add them in Settings → Sites & Departments.
            </p>
          </div>

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
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
