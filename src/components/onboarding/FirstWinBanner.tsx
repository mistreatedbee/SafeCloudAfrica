import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { CheckCircle2Icon, CircleIcon, HelpCircleIcon, XIcon } from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import type { UUID } from '../../api/models/core';
import type { FirstWinPersona } from './firstWinConfig';
import {
  filterStepsByModule,
  getStepsForPersona,
  isStepComplete
} from './firstWinConfig';
import { loadFirstWinMetrics } from './firstWinMetrics';
import { dismissFirstWin, isFirstWinHiddenByStorage, snoozeFirstWin } from './firstWinStorage';

const SNOOZE_DAYS = 7;

const PERSONA_TITLES: Record<FirstWinPersona, string> = {
  owner: 'Get started with your organisation',
  hr: 'First wins for HR',
  safety: 'First wins for safety',
  employee: 'Get started as an employee'
};

export type FirstWinBannerProps = {
  persona: FirstWinPersona;
  className?: string;
};

export function FirstWinBanner({ persona, className = '' }: FirstWinBannerProps) {
  const { activeCompanyId, enabledModules } = useTenant();
  const { user } = useUser();
  const userId = (user?.id as UUID | undefined) ?? null;

  const [storageHidden, setStorageHidden] = useState(false);

  useEffect(() => {
    if (!activeCompanyId) {
      setStorageHidden(true);
      return;
    }
    setStorageHidden(isFirstWinHiddenByStorage(activeCompanyId, persona));
  }, [activeCompanyId, persona]);

  const steps = useMemo(
    () => filterStepsByModule(getStepsForPersona(persona, enabledModules), enabledModules),
    [persona, enabledModules]
  );

  const { data: metrics, loading } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      if (persona === 'employee' && !userId) return null;
      return loadFirstWinMetrics({
        persona,
        companyId: activeCompanyId,
        userId,
        enabledModules
      });
    },
    [activeCompanyId, persona, userId, enabledModules]
  );

  const { doneCount, total, allDone, rows } = useMemo(() => {
    if (steps.length === 0) {
      return { doneCount: 0, total: 0, allDone: false, rows: [] as Array<{ step: (typeof steps)[0]; done: boolean }> };
    }
    const rowsInner = steps.map((step) => ({
      step,
      done: metrics ? isStepComplete(step, persona, metrics, enabledModules) : false
    }));
    const done = rowsInner.filter((r) => r.done).length;
    return {
      doneCount: done,
      total: steps.length,
      allDone: !!metrics && done === steps.length,
      rows: rowsInner
    };
  }, [metrics, steps, persona, enabledModules]);

  if (!activeCompanyId || storageHidden || steps.length === 0) return null;
  if (persona === 'employee' && !userId) return null;
  if (allDone) return null;

  const onDismiss = () => {
    dismissFirstWin(activeCompanyId, persona);
    setStorageHidden(true);
  };

  const onSnooze = () => {
    snoozeFirstWin(activeCompanyId, persona, SNOOZE_DAYS);
    setStorageHidden(true);
  };

  return (
    <div
      className={`bg-white rounded-xl border border-surface-300 shadow-card p-4 ${className}`.trim()}
      data-first-win-banner={persona}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-charcoal">{PERSONA_TITLES[persona]}</h2>
          <p className="text-xs text-charcoal-500 mt-0.5">
            {loading ? 'Checking your progress…' : `${doneCount} of ${total} complete`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSnooze}
            className="text-xs font-medium text-charcoal-600 hover:text-charcoal px-2 py-1 rounded-lg border border-surface-300 bg-surface-50"
          >
            Remind me in {SNOOZE_DAYS} days
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-charcoal-400 hover:text-charcoal hover:bg-surface-100"
            aria-label="Dismiss checklist"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden mb-3">
        <div
          className="h-full bg-teal rounded-full transition-all duration-300"
          style={{ width: total === 0 ? '0%' : `${Math.round((doneCount / total) * 100)}%` }}
        />
      </div>

      <ul className="space-y-2">
        {rows.map(({ step, done }) => (
          <li key={step.id}>
            <div className="flex items-start gap-2">
              {done ? (
                <CheckCircle2Icon className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden />
              ) : (
                <CircleIcon className="w-5 h-5 text-surface-400 shrink-0 mt-0.5" aria-hidden />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    to={step.to}
                    className={`text-sm font-medium ${done ? 'text-charcoal-500 line-through' : 'text-teal hover:underline'}`}
                  >
                    {step.label}
                  </Link>
                  {step.tooltip ? (
                    <span className="inline-flex" title={step.tooltip}>
                      <HelpCircleIcon className="w-3.5 h-3.5 text-charcoal-400" aria-label={step.tooltip} />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
