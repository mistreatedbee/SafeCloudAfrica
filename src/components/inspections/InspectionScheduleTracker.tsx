import React, { useMemo } from 'react';
import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import type { InspectionRun } from '../../api/models/entities';
import {
  getInspectionPeriodKey,
  isInspectionOverdue,
  type InspectionFrequency
} from '../../utils/inspectionFrequency';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function InspectionScheduleTracker(props: {
  frequency: InspectionFrequency | string | null | undefined;
  runs: InspectionRun[];
}) {
  const frequency = (props.frequency ?? 'daily') as InspectionFrequency;
  const now = new Date();

  const completedPeriodKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const run of props.runs) {
      if (run.status !== 'completed') continue;
      const key = (run as any).tracking_period_key || getInspectionPeriodKey(frequency, run.completed_at ?? run.started_at);
      keys.add(key);
    }
    return keys;
  }, [props.runs, frequency]);

  const lastCompletedAt = useMemo(() => {
    const completed = props.runs
      .filter((r) => r.status === 'completed' && r.completed_at)
      .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime());
    return completed[0]?.completed_at ?? null;
  }, [props.runs]);

  const overdue = isInspectionOverdue(frequency, lastCompletedAt, now);

  if (frequency === 'audit-linked' || frequency === 'ad_hoc') {
    return null;
  }

  return (
    <div className="border border-surface-200 rounded-xl p-4 bg-surface-50">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-charcoal">Schedule</p>
        {overdue && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-critical/10 text-critical text-xs font-semibold">
            <AlertTriangleIcon className="w-3 h-3" /> Overdue
          </span>
        )}
      </div>

      {frequency === 'daily' && (
        <div className="flex gap-2">
          {DAY_LABELS.map((label, i) => {
            const dayDate = new Date(startOfIsoWeek(now));
            dayDate.setDate(dayDate.getDate() + i);
            const key = getInspectionPeriodKey('daily', dayDate);
            const done = completedPeriodKeys.has(key);
            const isToday = dayDate.toDateString() === now.toDateString();
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <span className={`text-[10px] font-medium ${isToday ? 'text-teal' : 'text-charcoal-500'}`}>{label}</span>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs ${
                    done
                      ? 'bg-teal text-white border-teal'
                      : isToday
                        ? 'border-teal text-teal'
                        : 'border-surface-300 text-charcoal-400'
                  }`}
                >
                  {done ? <CheckIcon className="w-3.5 h-3.5" /> : dayDate.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {frequency === 'weekly' && (
        <p className="text-sm text-charcoal">
          {completedPeriodKeys.has(getInspectionPeriodKey('weekly', now)) ? 'Completed this week' : 'Not yet completed this week'}
        </p>
      )}

      {frequency === 'monthly' && (
        <p className="text-sm text-charcoal">
          {completedPeriodKeys.has(getInspectionPeriodKey('monthly', now)) ? 'Completed this month' : 'Not yet completed this month'}
        </p>
      )}

      {frequency === 'quarterly' && (
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((q) => {
            const key = `${now.getFullYear()}-Q${q}`;
            const done = completedPeriodKeys.has(key);
            const isCurrent = Math.floor(now.getMonth() / 3) + 1 === q;
            return (
              <div
                key={q}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  done
                    ? 'bg-teal text-white border-teal'
                    : isCurrent
                      ? 'border-teal text-teal'
                      : 'border-surface-300 text-charcoal-500'
                }`}
              >
                Q{q}
              </div>
            );
          })}
        </div>
      )}

      {frequency === 'annually' && (
        <p className="text-sm text-charcoal">
          {completedPeriodKeys.has(String(now.getFullYear())) ? `Completed for ${now.getFullYear()}` : `Not yet completed for ${now.getFullYear()}`}
        </p>
      )}
    </div>
  );
}
