import React, { useEffect, useMemo, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useDraftManager } from './DraftManagerProvider';

function formatSavedTime(value: number | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function getStatusCopy(input: {
  status: string;
  lastSavedAt: number | null;
  lastError: string | null;
  hasPendingUploads: boolean;
}): { title: string; detail: string | null; tone: 'neutral' | 'success' | 'warning' | 'danger' } {
  const savedTime = formatSavedTime(input.lastSavedAt);

  if (input.hasPendingUploads) {
    return {
      title: 'Files still need attention',
      detail: 'Selected files are not fully protected until upload completes.',
      tone: 'warning'
    };
  }

  switch (input.status) {
    case 'pending':
      return { title: 'Changes pending…', detail: 'Autosave will run in a moment.', tone: 'neutral' };
    case 'saving-local':
      return { title: 'Saving draft…', detail: 'Your latest changes are being protected locally.', tone: 'neutral' };
    case 'syncing-server':
      return { title: 'Syncing draft…', detail: savedTime ? `Last local save ${savedTime}.` : 'Saving to the server in the background.', tone: 'neutral' };
    case 'saved-server':
      return { title: 'Draft saved', detail: savedTime ? `Last saved at ${savedTime}.` : 'Draft saved successfully.', tone: 'success' };
    case 'saved-local':
      return { title: 'Draft saved locally', detail: savedTime ? `Last saved at ${savedTime}.` : 'Your work is protected on this device.', tone: 'success' };
    case 'retrying':
      return {
        title: 'Draft saved locally',
        detail: input.lastError ?? 'Server sync will retry automatically.',
        tone: 'warning'
      };
    case 'error':
      return {
        title: 'Draft could not be saved',
        detail: input.lastError ?? 'Retrying in the background.',
        tone: 'danger'
      };
    case 'restored':
      return { title: 'Draft restored', detail: savedTime ? `Recovered from ${savedTime}.` : 'Your previous draft has been restored.', tone: 'success' };
    default:
      return { title: 'Autosave ready', detail: savedTime ? `Last saved at ${savedTime}.` : null, tone: 'neutral' };
  }
}

function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'danger'): string {
  if (tone === 'success') return 'border-success/25 bg-white text-charcoal';
  if (tone === 'warning') return 'border-warning/30 bg-white text-charcoal';
  if (tone === 'danger') return 'border-critical/30 bg-white text-charcoal';
  return 'border-surface-300 bg-white text-charcoal';
}

export function DraftExperience() {
  const { pendingPrompt, resolvePendingPrompt, primaryDraftState, shouldWarnOnNavigation } = useDraftManager();
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  useBeforeUnload(
    React.useCallback(
      (event) => {
        if (!shouldWarnOnNavigation) return;
        event.preventDefault();
        event.returnValue = 'Your latest draft changes are still being saved.';
      },
      [shouldWarnOnNavigation]
    )
  );

  const blocker = useBlocker(shouldWarnOnNavigation);

  useEffect(() => {
    if (blocker.state === 'blocked') setShowLeaveModal(true);
  }, [blocker.state]);

  const copy = useMemo(() => {
    if (!primaryDraftState) return null;
    return getStatusCopy({
      status: primaryDraftState.status,
      lastSavedAt: primaryDraftState.lastSavedAt,
      lastError: primaryDraftState.lastError,
      hasPendingUploads: primaryDraftState.hasPendingUploads
    });
  }, [primaryDraftState]);

  return (
    <>
      {primaryDraftState && copy && primaryDraftState.isRegistered && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] max-w-sm">
          <div className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl ${toneClasses(copy.tone)}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-400">{primaryDraftState.label}</p>
            <p className="mt-1 text-sm font-semibold">{copy.title}</p>
            {copy.detail && <p className="mt-1 text-xs text-charcoal-500">{copy.detail}</p>}
          </div>
        </div>
      )}

      {pendingPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative w-full max-w-md rounded-2xl border border-surface-300 bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-charcoal">Saved Draft Found</h2>
            <p className="mt-2 text-sm text-charcoal-600">
              A saved draft was found for {pendingPrompt.label.toLowerCase()}. Would you like to continue where you left off?
            </p>
            <p className="mt-1 text-xs text-charcoal-500">
              Last saved at {formatSavedTime(pendingPrompt.updatedAt) ?? 'an earlier time'}.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void resolvePendingPrompt('discard')}
                className="min-h-[44px] rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
              >
                Discard Draft
              </button>
              <button
                type="button"
                onClick={() => void resolvePendingPrompt('restore')}
                className="min-h-[44px] rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
              >
                Restore Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveModal && blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative w-full max-w-md rounded-2xl border border-surface-300 bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-charcoal">Leave This Form?</h2>
            <p className="mt-2 text-sm text-charcoal-600">
              Your latest changes are still being saved. Are you sure you want to leave this page?
            </p>
            {primaryDraftState?.hasPendingUploads && (
              <p className="mt-2 text-sm text-warning">
                Selected files are not fully protected until upload completes.
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  blocker.reset();
                  setShowLeaveModal(false);
                }}
                className="min-h-[44px] rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={() => {
                  blocker.proceed();
                  setShowLeaveModal(false);
                }}
                className="min-h-[44px] rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-white hover:bg-critical-600"
              >
                Leave Page
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
