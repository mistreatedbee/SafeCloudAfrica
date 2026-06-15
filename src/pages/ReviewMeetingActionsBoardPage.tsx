import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listReviewActionItems } from '../api/services/reviewMeetingsService';
import type { ReviewMeetingItemStatus } from '../api/models/entities';

export function ReviewMeetingActionsBoardPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const [status, setStatus] = useState<ReviewMeetingItemStatus | 'ALL'>('ALL');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const viewer = useMemo(() => {
    if (!user?.id || !activeRole || !activeCompanyId) return undefined;
    return {
      userId: user.id as string,
      role: activeRole,
      membership: memberships.find((m) => m.company_id === activeCompanyId && m.user_id === user.id) ?? null,
      email: user.email ?? null
    };
  }, [activeCompanyId, activeRole, memberships, user?.email, user?.id]);

  const { data, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId || !viewer) return [];
      return await listReviewActionItems({
        companyId: activeCompanyId,
        viewer,
        status,
        responsibleUserId: responsibleUserId || undefined,
        from: from || undefined,
        to: to || undefined
      });
    },
    [activeCompanyId, viewer?.userId, viewer?.role, status, responsibleUserId, from, to]
  );

  const items = data ?? [];

  return (
    <Layout title="Review Action Items Board">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-charcoal-500">All review action items across meetings.</p>
            <Link to="/document-reviews" className="text-sm text-teal hover:underline">
              Back to meetings
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ReviewMeetingItemStatus | 'ALL')} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="ALL">All</option>
              <option value="OUTSTANDING">Outstanding</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">Responsible person ID</span>
            <input value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} placeholder="Optional user id" className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </label>
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </label>
          <label className="text-sm">
            <span className="block mb-1 text-charcoal-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </label>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-surface-50 text-charcoal-500">
              <tr>
                <th className="px-4 py-3 text-left">Meeting</th>
                <th className="px-4 py-3 text-left">Topic</th>
                <th className="px-4 py-3 text-left">Action required</th>
                <th className="px-4 py-3 text-left">Responsible</th>
                <th className="px-4 py-3 text-left">Target date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-charcoal-500">
                    Loading action items...
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-critical">
                    {error.message}
                  </td>
                </tr>
              )}
              {!loading && !error && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-sm text-charcoal-500">
                    No action items yet.
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <Link className="text-teal hover:underline" to={`/document-reviews/${item.meeting.id}`}>
                        {item.meeting.title ?? 'Management Review Meeting'}
                      </Link>
                      <p className="text-xs text-charcoal-500">
                        {item.meeting.date} {item.meeting.time}
                      </p>
                    </td>
                    <td className="px-4 py-3">{item.review_item}</td>
                    <td className="px-4 py-3">{item.action_required}</td>
                    <td className="px-4 py-3">{item.responsible_name_external ?? item.responsible_user_id ?? '—'}</td>
                    <td className="px-4 py-3">{item.target_date ?? '—'}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.completion_date ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
