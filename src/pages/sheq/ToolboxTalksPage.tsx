import { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Loader2Icon, PaperclipIcon, SparklesIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { HrEmployeeMultiSelect } from '../../components/ui/HrEmployeeMultiSelect';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { generateToolboxTalkNotes } from '../../api/services/aiToolboxTalkService';
import { searchHrEmployees } from '../../api/services/hrService';
import { uploadFile } from '../../api/services/storageService';
import {
  addToolboxTalkSignoff,
  countToolboxTalkAttendees,
  createToolboxTalk,
  deleteToolboxTalk,
  listToolboxTalkSignoffs,
  listToolboxTalks,
  normalizeToolboxTalkAttendees,
  updateToolboxTalk,
  type ToolboxTalk,
  type ToolboxTalkAttendees,
  type ToolboxTalkSignoff
} from '../../api/services/toolboxTalksService';
import { listSites } from '../../api/services/sitesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { MANAGEMENT_ROLES } from '../../constants/roles';

function StatusBadge({ status }: { status: string }) {
  return status === 'COMPLETE' ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Complete</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Draft</span>
  );
}

function emptyAttendees(): ToolboxTalkAttendees {
  return { employeeIds: [], externalNames: [] };
}

export function ToolboxTalksPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = MANAGEMENT_ROLES.includes(activeRole as typeof MANAGEMENT_ROLES[number]);

  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [conductedAt, setConductedAt] = useState(new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState('');
  const [attendees, setAttendees] = useState<ToolboxTalkAttendees>(emptyAttendees);
  const [notes, setNotes] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<{
    fileUrl: string;
    fileName: string;
    mimeType: string | null;
  } | null>(null);
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [signoffName, setSignoffName] = useState('');
  const [signoffSignature, setSignoffSignature] = useState('');
  const [signoffEmployeeId, setSignoffEmployeeId] = useState<UUID | ''>('');
  const [signing, setSigning] = useState(false);

  const {
    data: talks,
    loading: talksLoading,
    error: talksError,
    refetch
  } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listToolboxTalks(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const { data: signoffs, refetch: refetchSignoffs } = useAsync<ToolboxTalkSignoff[]>(
    async () => {
      if (!activeCompanyId || !editingId) return [];
      return listToolboxTalkSignoffs({ companyId: activeCompanyId, talkId: editingId });
    },
    [activeCompanyId, editingId]
  );

  const { data: hrEmployees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return searchHrEmployees(activeCompanyId, { includeUnlinked: true, limit: 500 });
  }, [activeCompanyId]);

  const employeeNameById = useMemo(() => {
    const map = new Map<UUID, string>();
    (hrEmployees ?? []).forEach((employee) => {
      const name = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email;
      map.set(employee.id, name);
    });
    return map;
  }, [hrEmployees]);

  const activeSites = (sites ?? []).filter((site) => site.is_active);
  const initialTalksLoading = talksLoading && talks == null;

  function beginEdit(talk: ToolboxTalk) {
    const normalized = normalizeToolboxTalkAttendees(talk);
    setEditingId(talk.id as UUID);
    setTitle(talk.title);
    setTopic(talk.topic ?? '');
    setConductedAt(talk.conducted_at.slice(0, 10));
    setSiteId(talk.site_id ? String(talk.site_id) : '');
    setAttendees(normalized);
    setNotes(talk.notes ?? '');
    setAttachmentFile(null);
    setExistingAttachment(
      talk.attachment_file_url
        ? {
            fileUrl: talk.attachment_file_url,
            fileName: talk.attachment_file_name ?? 'Attachment',
            mimeType: talk.attachment_mime_type
          }
        : null
    );
    setSignoffName('');
    setSignoffSignature('');
    setSignoffEmployeeId('');
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setTopic('');
    setConductedAt(new Date().toISOString().slice(0, 10));
    setSiteId('');
    setAttendees(emptyAttendees());
    setNotes('');
    setAttachmentFile(null);
    setExistingAttachment(null);
    setSignoffName('');
    setSignoffSignature('');
    setSignoffEmployeeId('');
    setError(null);
  }

  async function onGenerateWithAi() {
    if (!title.trim() && !topic.trim()) {
      setError('Enter a title or topic before generating with AI.');
      return;
    }
    setAiGenerating(true);
    setError(null);
    try {
      const generated = await generateToolboxTalkNotes({ title, topic });
      setNotes(generated);
      setSuccess('AI draft added to notes. Review and edit before saving.');
    } catch (err) {
      setError(toUserFacingError(err, 'Could not generate toolbox talk notes.'));
    } finally {
      setAiGenerating(false);
    }
  }

  async function uploadAttachmentIfNeeded(companyId: UUID): Promise<{
    fileUrl: string;
    fileKey: string;
    fileName: string;
    mimeType: string | null;
  } | null> {
    if (!attachmentFile) {
      if (existingAttachment) {
        return {
          fileUrl: existingAttachment.fileUrl,
          fileKey: '',
          fileName: existingAttachment.fileName,
          mimeType: existingAttachment.mimeType
        };
      }
      return null;
    }
    const key = `toolbox-talks/${companyId}/${Date.now()}-${attachmentFile.name}`;
    const uploaded = await uploadFile('sca-evidence', attachmentFile, { key });
    return {
      fileUrl: uploaded.url,
      fileKey: uploaded.key,
      fileName: attachmentFile.name,
      mimeType: uploaded.mimeType || attachmentFile.type || null
    };
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !title.trim()) {
      setError('Talk title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const attachment = await uploadAttachmentIfNeeded(activeCompanyId);
      if (editingId) {
        await updateToolboxTalk({
          companyId: activeCompanyId,
          talkId: editingId,
          patch: {
            title: title.trim(),
            topic: topic.trim() || null,
            conducted_at: conductedAt,
            site_id: (siteId || null) as UUID | null,
            attendees,
            notes: notes.trim() || null,
            ...(attachment
              ? {
                  attachment_file_url: attachment.fileUrl,
                  attachment_file_key: attachment.fileKey || null,
                  attachment_file_name: attachment.fileName,
                  attachment_mime_type: attachment.mimeType
                }
              : {})
          },
          actorUserId: user.id as UUID
        });
        setSuccess('Toolbox talk updated.');
        if (attachment) {
          setExistingAttachment({
            fileUrl: attachment.fileUrl,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType
          });
          setAttachmentFile(null);
        }
      } else {
        await createToolboxTalk({
          companyId: activeCompanyId,
          title: title.trim(),
          topic: topic.trim() || null,
          conductedAt,
          siteId: (siteId || null) as UUID | null,
          attendees,
          notes: notes.trim() || null,
          attachment,
          actorUserId: user.id as UUID
        });
        setSuccess('Toolbox talk created.');
        resetForm();
      }
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save toolbox talk right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onMarkComplete(talk: ToolboxTalk) {
    if (!activeCompanyId || !user?.id) return;
    if (countToolboxTalkAttendees(talk) === 0) {
      setError('At least one attendee must be recorded before marking complete.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await updateToolboxTalk({
        companyId: activeCompanyId,
        talkId: talk.id as UUID,
        patch: { status: 'COMPLETE' },
        actorUserId: user.id as UUID
      });
      setSuccess('Marked as complete.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update status.'));
    }
  }

  async function onDelete(talk: ToolboxTalk) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete toolbox talk "${talk.title}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteToolboxTalk({ companyId: activeCompanyId, talkId: talk.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Toolbox talk deleted.');
      if (editingId === (talk.id as UUID)) resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete toolbox talk.'));
    }
  }

  async function onRecordSignoff() {
    if (!activeCompanyId || !user?.id || !editingId) return;
    const employeeName =
      signoffName.trim() ||
      (signoffEmployeeId ? employeeNameById.get(signoffEmployeeId) ?? '' : '');
    if (!employeeName) {
      setError('Select an attendee or enter a name before signing.');
      return;
    }
    if (!signoffSignature.trim()) {
      setError('Enter a typed signature (initials or confirmation token).');
      return;
    }
    setSigning(true);
    setError(null);
    try {
      await addToolboxTalkSignoff({
        companyId: activeCompanyId,
        talkId: editingId,
        actorUserId: user.id as UUID,
        employeeId: signoffEmployeeId || null,
        employeeName,
        signature: signoffSignature.trim()
      });
      setSignoffName('');
      setSignoffSignature('');
      setSignoffEmployeeId('');
      setSuccess('Signature recorded.');
      await refetchSignoffs();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to record signature.'));
    } finally {
      setSigning(false);
    }
  }

  const siteLabel = new Map((sites ?? []).map((site) => [String(site.id), site.name]));
  const attendeeOptions = useMemo(() => {
    const options: Array<{ id: UUID | ''; label: string }> = [{ id: '', label: '— Select attendee —' }];
    attendees.employeeIds.forEach((employeeId) => {
      options.push({ id: employeeId, label: employeeNameById.get(employeeId) ?? `Employee ${employeeId.slice(0, 8)}` });
    });
    attendees.externalNames.forEach((name) => {
      options.push({ id: '', label: `${name} (manual)` });
    });
    return options;
  }, [attendees, employeeNameById]);

  const signedNames = new Set((signoffs ?? []).map((signoff) => signoff.employee_name.toLowerCase()));
  const pendingAttendeeNames = useMemo(() => {
    const names = [
      ...attendees.employeeIds.map((id) => employeeNameById.get(id) ?? `Employee ${id.slice(0, 8)}`),
      ...attendees.externalNames
    ];
    return names.filter((name) => !signedNames.has(name.toLowerCase()));
  }, [attendees, employeeNameById, signoffs]);

  return (
    <Layout title="Toolbox Talks">
      <div className="space-y-4">
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {canManage && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">{editingId ? 'Edit toolbox talk' : 'Record new toolbox talk'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Title *</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fire Safety Awareness"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Topic</span>
                <input
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Emergency procedures"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Date conducted</span>
                <input
                  type="date"
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={conductedAt}
                  onChange={(e) => setConductedAt(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site (optional)</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">— No site —</option>
                  {activeSites.map((site) => (
                    <option key={site.id} value={String(site.id)}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Attendees</span>
                <HrEmployeeMultiSelect
                  companyId={activeCompanyId}
                  selectedEmployeeIds={attendees.employeeIds}
                  externalNames={attendees.externalNames}
                  onChange={(employeeIds, externalNames) => setAttendees({ employeeIds, externalNames })}
                  placeholder="Search HR employees or add a manual name..."
                />
                <p className="mt-1 text-xs text-charcoal-500">
                  Attendees are linked to HR employee records where possible. Use “Add name manually” for visitors or contractors not in HR.
                </p>
              </div>
              <div className="text-sm md:col-span-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="block text-xs text-charcoal-500">Notes</span>
                  <button
                    type="button"
                    onClick={() => void onGenerateWithAi()}
                    disabled={aiGenerating || (!title.trim() && !topic.trim())}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal text-teal text-xs hover:bg-teal/5 disabled:opacity-60"
                  >
                    {aiGenerating ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                    {aiGenerating ? 'Generating…' : 'Generate with AI'}
                  </button>
                </div>
                <textarea
                  rows={6}
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key points discussed, action items..."
                />
              </div>
              <div className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Attachment (sign-in sheet / PDF)</span>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-surface-300 rounded-lg cursor-pointer hover:border-teal">
                  <PaperclipIcon className="w-4 h-4 text-charcoal-400" />
                  <span className="text-sm text-charcoal-600">
                    {attachmentFile?.name ?? existingAttachment?.fileName ?? 'Choose file to attach'}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {existingAttachment?.fileUrl && !attachmentFile && (
                  <a
                    href={existingAttachment.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-2 text-xs text-teal hover:underline"
                  >
                    View current attachment
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60"
                onClick={() => void onSave()}
                disabled={saving || !title.trim()}
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save talk'}
              </button>
              {editingId && (
                <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>

            {editingId && (
              <div className="border-t border-surface-200 pt-4 space-y-3">
                <h4 className="font-medium text-sm">Attendee e-signatures</h4>
                <p className="text-xs text-charcoal-500">
                  Record typed signatures for attendees on this toolbox talk or attached sign-in sheet. This follows the same confirmation pattern used elsewhere in IDSMP.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    value={signoffEmployeeId}
                    onChange={(e) => {
                      const nextId = (e.target.value || '') as UUID | '';
                      setSignoffEmployeeId(nextId);
                      if (nextId) setSignoffName(employeeNameById.get(nextId) ?? '');
                    }}
                  >
                    {attendeeOptions.map((option, index) => (
                      <option key={`${option.id}-${index}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={signoffName}
                    onChange={(e) => setSignoffName(e.target.value)}
                    placeholder="Attendee name"
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                  />
                  <input
                    value={signoffSignature}
                    onChange={(e) => setSignoffSignature(e.target.value)}
                    placeholder="Typed signature / initials"
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void onRecordSignoff()}
                  disabled={signing}
                  className="px-3 py-2 rounded-lg bg-charcoal text-white text-sm disabled:opacity-60"
                >
                  {signing ? 'Recording…' : 'Record signature'}
                </button>
                <div className="space-y-2">
                  {(signoffs ?? []).map((signoff) => (
                    <div key={signoff.id} className="border border-surface-200 rounded-lg px-3 py-2 text-sm">
                      <p className="font-medium text-charcoal">{signoff.employee_name}</p>
                      <p className="text-xs text-charcoal-500">
                        Signed {new Date(signoff.signed_at).toLocaleString()}
                        {signoff.signature ? ` · ${signoff.signature}` : ''}
                      </p>
                    </div>
                  ))}
                  {(signoffs ?? []).length === 0 && (
                    <p className="text-sm text-charcoal-500">No signatures recorded yet.</p>
                  )}
                </div>
                {pendingAttendeeNames.length > 0 && (
                  <div className="text-xs text-charcoal-500">
                    Pending signatures: {pendingAttendeeNames.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {talksError && (
          <div className="bg-critical/10 border border-critical/30 rounded-xl p-4 text-sm text-critical space-y-2">
            <p>Could not load toolbox talks: {toUserFacingError(talksError, 'Unknown error')}</p>
            <button type="button" onClick={() => void refetch()} className="text-teal hover:underline">
              Retry
            </button>
          </div>
        )}

        {initialTalksLoading ? (
          <div className="bg-white border border-surface-300 rounded-xl p-6 text-center text-sm text-charcoal-500">
            Loading toolbox talks…
          </div>
        ) : (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Toolbox talks ({(talks ?? []).length})</h3>
              {talksLoading && talks != null && (
                <span className="text-xs text-charcoal-500 inline-flex items-center gap-1">
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  Refreshing…
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-4 py-2">Title</th>
                  <th className="text-left px-4 py-2">Topic</th>
                  <th className="text-left px-4 py-2">Site</th>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Attendees</th>
                  <th className="text-left px-4 py-2">Attachment</th>
                  <th className="text-left px-4 py-2">Status</th>
                  {canManage && <th className="text-left px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(talks ?? []).length === 0 && !talksError && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="px-4 py-6 text-charcoal-500 text-center">
                      No toolbox talks yet. Schedule your first talk.
                    </td>
                  </tr>
                )}
                {(talks ?? []).map((talk) => (
                  <tr key={talk.id} className="border-t border-surface-100">
                    <td className="px-4 py-2 font-medium">{talk.title}</td>
                    <td className="px-4 py-2 text-charcoal-500">{talk.topic ?? '-'}</td>
                    <td className="px-4 py-2 text-charcoal-500">{talk.site_id ? (siteLabel.get(String(talk.site_id)) ?? '-') : '-'}</td>
                    <td className="px-4 py-2 text-charcoal-500">{talk.conducted_at.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-charcoal-500">{countToolboxTalkAttendees(talk)}</td>
                    <td className="px-4 py-2 text-charcoal-500">
                      {talk.attachment_file_url ? (
                        <a href={talk.attachment_file_url} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={talk.status} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex gap-3">
                          <button className="text-teal hover:underline" onClick={() => beginEdit(talk)}>
                            Edit
                          </button>
                          {talk.status === 'DRAFT' && (
                            <button className="text-emerald-600 hover:underline" onClick={() => void onMarkComplete(talk)}>
                              Complete
                            </button>
                          )}
                          <button className="text-critical hover:underline" onClick={() => void onDelete(talk)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
