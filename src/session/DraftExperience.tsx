import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';
import { GripVerticalIcon } from 'lucide-react';
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
}): { title: string; detail: string | null; tone: 'neutral' | 'success' | 'warning' | 'danger'; settled: boolean } {
  const savedTime = formatSavedTime(input.lastSavedAt);

  if (input.hasPendingUploads) {
    return {
      title: 'Files still need attention',
      detail: 'Selected files are not fully protected until upload completes.',
      tone: 'warning',
      settled: false
    };
  }

  switch (input.status) {
    case 'pending':
      return { title: 'Changes pending...', detail: 'Autosave will run in a moment.', tone: 'neutral', settled: false };
    case 'saving-local':
      return { title: 'Saving draft...', detail: 'Your latest changes are being protected locally.', tone: 'neutral', settled: false };
    case 'syncing-server':
      return {
        title: 'Syncing draft...',
        detail: savedTime ? `Last local save ${savedTime}.` : 'Saving to the server in the background.',
        tone: 'neutral',
        settled: false
      };
    case 'saved-server':
      return { title: 'Draft saved', detail: savedTime ? `Last saved at ${savedTime}.` : 'Draft saved successfully.', tone: 'success', settled: true };
    case 'saved-local':
      return { title: 'Draft saved locally', detail: savedTime ? `Last saved at ${savedTime}.` : 'Your work is protected on this device.', tone: 'success', settled: true };
    case 'retrying':
      return {
        title: 'Draft saved locally',
        detail: input.lastError ?? 'Server sync will retry automatically.',
        tone: 'warning',
        settled: false
      };
    case 'error':
      return {
        title: 'Draft could not be saved',
        detail: input.lastError ?? 'Retrying in the background.',
        tone: 'danger',
        settled: false
      };
    case 'restored':
      return { title: 'Draft restored', detail: savedTime ? `Recovered from ${savedTime}.` : 'Your previous draft has been restored.', tone: 'success', settled: true };
    default:
      return { title: 'Autosave ready', detail: savedTime ? `Last saved at ${savedTime}.` : null, tone: 'neutral', settled: true };
  }
}

function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'danger'): string {
  if (tone === 'success') return 'border-success/25 bg-white text-charcoal';
  if (tone === 'warning') return 'border-warning/30 bg-white text-charcoal';
  if (tone === 'danger') return 'border-critical/30 bg-white text-charcoal';
  return 'border-surface-300 bg-white text-charcoal';
}

// Once a save settles into a "done" state (saved/restored, not actively
// saving/erroring/retrying), fade it out after this long so it doesn't sit
// on screen indefinitely -- it reappears immediately the moment status
// changes again (e.g. the next autosave kicks off).
const SETTLED_AUTO_HIDE_MS = 6000;
const DRAG_HINT_SESSION_KEY = 'sca_draft_drag_hint_seen';
const DRAG_POSITION_SESSION_KEY = 'sca_draft_pill_position';

type Position = { x: number; y: number };

function loadStoredPosition(): Position | null {
  try {
    const raw = sessionStorage.getItem(DRAG_POSITION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch {
    // ignore -- storage unavailable
  }
  return null;
}

/**
 * The autosave-status pill, draggable and bottom-centred by default (moved
 * off bottom-right where it was crowding the support-chat and AI-assistant
 * buttons into the same corner). Drag offset is stored in sessionStorage so
 * a user who moves it out of the way once doesn't have to keep moving it on
 * every subsequent form in the same browser session.
 */
export function DraftExperience() {
  const { pendingPrompt, resolvePendingPrompt, primaryDraftState, shouldWarnOnNavigation } = useDraftManager();
  const [offset, setOffset] = useState<Position>(() => loadStoredPosition() ?? { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showDragHint, setShowDragHint] = useState(() => {
    try {
      return sessionStorage.getItem(DRAG_HINT_SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const hideTimerRef = useRef<number | null>(null);

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

  const copy = useMemo(() => {
    if (!primaryDraftState) return null;
    return getStatusCopy({
      status: primaryDraftState.status,
      lastSavedAt: primaryDraftState.lastSavedAt,
      lastError: primaryDraftState.lastError,
      hasPendingUploads: primaryDraftState.hasPendingUploads
    });
  }, [primaryDraftState]);

  // Any non-settled status (actively saving, retrying, erroring) always
  // shows immediately, even if a previous settled state had just faded out.
  useEffect(() => {
    if (!copy) return;
    if (!copy.settled) {
      setHidden(false);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      return;
    }
    setHidden(false);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setHidden(true), SETTLED_AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy?.title, copy?.settled]);

  useEffect(() => {
    if (!dragging) return;

    function handlePointerMove(event: PointerEvent) {
      const start = dragStartRef.current;
      if (!start) return;
      const next = { x: start.originX + (event.clientX - start.pointerX), y: start.originY + (event.clientY - start.pointerY) };
      setOffset(next);
    }
    function handlePointerUp() {
      setDragging(false);
      dragStartRef.current = null;
      setOffset((current) => {
        try {
          sessionStorage.setItem(DRAG_POSITION_SESSION_KEY, JSON.stringify(current));
        } catch {
          // ignore
        }
        return current;
      });
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging]);

  function startDrag(event: React.PointerEvent) {
    dragStartRef.current = { pointerX: event.clientX, pointerY: event.clientY, originX: offset.x, originY: offset.y };
    setDragging(true);
    if (showDragHint) {
      setShowDragHint(false);
      try {
        sessionStorage.setItem(DRAG_HINT_SESSION_KEY, '1');
      } catch {
        // ignore
      }
    }
  }

  const visible = primaryDraftState && copy && primaryDraftState.isRegistered && !hidden;

  return (
    <>
      {visible && (
        <div
          className="fixed bottom-4 left-1/2 z-[70] max-w-sm select-none"
          style={{ transform: `translateX(-50%) translate(${offset.x}px, ${offset.y}px)` }}
        >
          <div className={`pointer-events-auto flex items-start gap-2 rounded-2xl border px-3 py-3 shadow-xl transition-opacity ${toneClasses(copy.tone)} ${dragging ? 'opacity-90' : ''}`}>
            <button
              type="button"
              onPointerDown={startDrag}
              className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-charcoal-300 hover:bg-surface-100 hover:text-charcoal-500 active:cursor-grabbing"
              aria-label="Drag to move this notification"
              title="Drag to move"
            >
              <GripVerticalIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-400">{primaryDraftState.label}</p>
              <p className="mt-1 text-sm font-semibold">{copy.title}</p>
              {copy.detail && <p className="mt-1 text-xs text-charcoal-500">{copy.detail}</p>}
              {showDragHint && <p className="mt-1.5 text-[11px] italic text-charcoal-400">Tip: drag the handle to move this out of the way.</p>}
            </div>
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
    </>
  );
}
