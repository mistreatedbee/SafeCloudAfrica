import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarIcon, EyeIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { useUser } from '@insforge/react';
import { deleteReviewMeeting, listReviewMeetings } from '../api/services/reviewMeetingsService';
import type { ReviewMeetingStatus } from '../api/models/entities';

const statusOptions: Array<{ value: ReviewMeetingStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SIGNED', label: 'Signed' },
  { value: 'ARCHIVED', label: 'Archived' }
];

export function DocumentReviewsPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const [year, setYear] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<ReviewMeetingStatus | 'ALL'>('ALL');
  const [timing, setTiming] = useState<'all' | 'upcoming' | 'overdue'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const viewer = useMemo(() => {
    if (!user?.id || !activeRole || !activeCompanyId) return undefined;
    return {
      userId: user.id as string,
      role: activeRole,
      membership: memberships.find((m) => m.company_id === activeCompanyId && m.user_id === user.id) ?? null,
      email: user.email ?? null
    };
  }, [user?.id, user?.email, activeCompanyId, activeRole, memberships]);

  const { data, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId || !viewer) return [];
      return await listReviewMeetings({
        companyId: activeCompanyId,
        viewer,
        filters: { year, status, timing }
      });
    },
    [activeCompanyId, viewer?.userId, viewer?.role, year, status, timing, refreshKey]
  );

  const meetings = data ?? [];

  async function handleDelete(meetingId: string): Promise<void> {
    if (!activeCompanyId || !user?.id) return;
    if (!confirm('Delete this review meeting and all items?')) return;
    await deleteReviewMeeting({ companyId: activeCompanyId, meetingId, actorUserId: user.id as string });
    setRefreshKey((k) => k + 1);
  }

  return (
    <Layout title="Document Reviews - Management Review Meetings">
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-charcoal-500">
                Management review meetings with action tracking, sign-off, reminders, and report distribution.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/document-reviews/actions')}
                className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium text-charcoal hover:bg-surface-50"
              >
                Action Items Board
              </button>
              <button
                type="button"
                onClick={() => navigate('/document-reviews/new')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
              >
                <PlusIcon className="w-4 h-4" />
                New Meeting
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Year</span>
            <input
              type="number"
              min={2020}
              value={year ?? ''}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="All years"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>

          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReviewMeetingStatus | 'ALL')}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Timing</span>
            <select
              value={timing}
              onChange={(e) => setTiming(e.target.value as 'all' | 'upcoming' | 'overdue')}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            >
              <option value="all">All</option>
              <option value="upcoming">Upcoming</option>
              <option value="overdue">Overdue actions</option>
            </select>
          </label>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="bg-surface-50 text-xs uppercase tracking-wider text-charcoal-500">
              <tr>
                <th className="px-4 py-3 text-left">Meeting</th>
                <th className="px-4 py-3 text-left">Date/Time</th>
                <th className="px-4 py-3 text-left">Place</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Items</th>
                <th className="px-4 py-3 text-left">Next Meeting</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 text-sm">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-charcoal-500">
                    Loading meetings...
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-critical">
                    {error.message}
                  </td>
                </tr>
              )}
              {!loading && !error && meetings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-charcoal-500">
                    No review meetings found.
                  </td>
                </tr>
              )}
              {meetings.map(({ meeting, items }) => (
                <tr key={meeting.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-charcoal">{meeting.title ?? 'Management Review Meeting'}</p>
                    <p className="text-xs text-charcoal-500">MRM-{meeting.id.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-charcoal-500" />
                      <span>{meeting.date}</span>
                    </div>
                    <p className="text-xs text-charcoal-500">{meeting.time}</p>
                  </td>
                  <td className="px-4 py-3">{meeting.place}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-1 rounded bg-surface-100 text-xs font-semibold">{meeting.status}</span>
                  </td>
                  <td className="px-4 py-3">{items.length}</td>
                  <td className="px-4 py-3">{meeting.next_meeting_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/document-reviews/${meeting.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-surface-300 hover:bg-surface-50"
                      >
                        <EyeIcon className="w-4 h-4" />
                        Open
                      </Link>
                      {(activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager') && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(meeting.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-critical/40 text-critical hover:bg-critical/5"
                        >
                          <Trash2Icon className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
