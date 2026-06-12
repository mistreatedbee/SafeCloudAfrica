import { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listToolboxTalks,
  createToolboxTalk,
  updateToolboxTalk,
  deleteToolboxTalk,
  type ToolboxTalk
} from '../../api/services/toolboxTalksService';
import { listSites } from '../../api/services/sitesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';

function StatusBadge({ status }: { status: string }) {
  return status === 'COMPLETE' ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Complete</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Draft</span>
  );
}

export function ToolboxTalksPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');

  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [conductedAt, setConductedAt] = useState(new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState('');
  const [attendeesRaw, setAttendeesRaw] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: talks, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listToolboxTalks(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const activeSites = (sites ?? []).filter((s) => s.is_active);

  function beginEdit(t: ToolboxTalk) {
    setEditingId(t.id as UUID);
    setTitle(t.title);
    setTopic(t.topic ?? '');
    setConductedAt(t.conducted_at.slice(0, 10));
    setSiteId(t.site_id ? String(t.site_id) : '');
    setAttendeesRaw(Array.isArray(t.attendees) ? t.attendees.join(', ') : '');
    setNotes(t.notes ?? '');
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setTopic('');
    setConductedAt(new Date().toISOString().slice(0, 10));
    setSiteId('');
    setAttendeesRaw('');
    setNotes('');
    setError(null);
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !title.trim()) {
      setError('Talk title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const attendees = attendeesRaw.split(',').map((s) => s.trim()).filter(Boolean);
    try {
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
            notes: notes.trim() || null
          },
          actorUserId: user.id as UUID
        });
        setSuccess('Toolbox talk updated.');
      } else {
        await createToolboxTalk({
          companyId: activeCompanyId,
          title: title.trim(),
          topic: topic.trim() || null,
          conductedAt,
          siteId: (siteId || null) as UUID | null,
          attendees,
          notes: notes.trim() || null,
          actorUserId: user.id as UUID
        });
        setSuccess('Toolbox talk created.');
      }
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save toolbox talk right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onMarkComplete(t: ToolboxTalk) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await updateToolboxTalk({
        companyId: activeCompanyId,
        talkId: t.id as UUID,
        patch: { status: 'COMPLETE' },
        actorUserId: user.id as UUID
      });
      setSuccess('Marked as complete.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update status.'));
    }
  }

  async function onDelete(t: ToolboxTalk) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete toolbox talk "${t.title}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteToolboxTalk({ companyId: activeCompanyId, talkId: t.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Toolbox talk deleted.');
      if (editingId === (t.id as UUID)) resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete toolbox talk.'));
    }
  }

  const siteLabel = new Map((sites ?? []).map((s) => [String(s.id), s.name]));

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
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fire Safety Awareness" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Topic</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Emergency procedures" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Date conducted</span>
                <input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={conductedAt} onChange={(e) => setConductedAt(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site (optional)</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">— No site —</option>
                  {activeSites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Attendees (comma-separated names)</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={attendeesRaw} onChange={(e) => setAttendeesRaw(e.target.value)} placeholder="John Smith, Jane Doe, ..." />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Notes</span>
                <textarea rows={3} className="w-full border border-surface-300 rounded-lg px-3 py-2 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key points discussed, action items..." />
              </label>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onSave()} disabled={saving || !title.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save talk'}
              </button>
              {editingId && <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>Cancel</button>}
            </div>
          </div>
        )}

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <div className="px-4 py-3 border-b border-surface-200">
            <h3 className="font-semibold">Toolbox talks ({(talks ?? []).length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-100">
              <tr>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Topic</th>
                <th className="text-left px-4 py-2">Site</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Attendees</th>
                <th className="text-left px-4 py-2">Status</th>
                {canManage && <th className="text-left px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(talks ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-charcoal-500 text-center">No toolbox talks recorded yet.</td></tr>
              )}
              {(talks ?? []).map((t) => (
                <tr key={t.id} className="border-t border-surface-100">
                  <td className="px-4 py-2 font-medium">{t.title}</td>
                  <td className="px-4 py-2 text-charcoal-500">{t.topic ?? '-'}</td>
                  <td className="px-4 py-2 text-charcoal-500">{t.site_id ? (siteLabel.get(String(t.site_id)) ?? '-') : '-'}</td>
                  <td className="px-4 py-2 text-charcoal-500">{t.conducted_at.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-charcoal-500">{Array.isArray(t.attendees) ? t.attendees.length : 0}</td>
                  <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex gap-3">
                        <button className="text-teal hover:underline" onClick={() => beginEdit(t)}>Edit</button>
                        {t.status === 'DRAFT' && (
                          <button className="text-emerald-600 hover:underline" onClick={() => void onMarkComplete(t)}>Complete</button>
                        )}
                        <button className="text-critical hover:underline" onClick={() => void onDelete(t)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
