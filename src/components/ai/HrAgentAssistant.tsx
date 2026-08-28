import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { SparklesIcon, SendIcon, XIcon, Loader2Icon, CheckIcon, AlertTriangleIcon } from 'lucide-react';

import { useAgentContext } from '../../ai/agentContext';
import { askAgent, confirmAgentAction } from '../../ai/agentClient';
import type { AgentChatMessage, AgentProposedAction } from '../../ai/agentTypes';
import { getModuleHintForPath, STARTER_QUESTION_BY_MODULE } from '../../ai/routeModuleHint';
import { subscribeToUserFacingError } from '../../api/liveData';

/**
 * Floating entry point for the module-agent system. Separate from
 * FloatingSupportChat (support tickets) -- this is the AI assistant for
 * asking questions and drafting content across modules. Sits in the same
 * bottom-right corner as the support bubble but offset into its own column
 * (right-24 instead of right-5) so both buttons are always visible side by
 * side, never stacked/overlapping. Still degrades gracefully (fallback
 * replies) if the AI call itself fails.
 *
 * Two proactive nudges, both dismissible and non-blocking:
 * - Page nudge: on landing on any page routeModuleHint.ts recognises, the
 *   assistant introduces itself by the persona for that page (e.g.
 *   "Incidents Agent", "Risk Manager") with a one-click starter question.
 *   Fires on every navigation to a page with a hint, per explicit request --
 *   not gated to "once per session" -- so it stays visible/discoverable.
 * - Error nudge: whenever the app shows an error toast (ToastProvider ->
 *   emitUserFacingError), the assistant proactively offers help, rate-
 *   limited so a burst of errors doesn't spam multiple nudges.
 */

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedActions?: AgentProposedAction[];
  actionResults?: Record<string, { ok: boolean; message: string }>;
};

type PageNudge = { kind: 'page'; module: string; label: string; persona: string };
type ErrorNudge = { kind: 'error'; message: string };
type Nudge = PageNudge | ErrorNudge;

const NUDGE_SHOW_DELAY_MS = 1200;
const PAGE_NUDGE_AUTO_DISMISS_MS = 8000;
const ERROR_NUDGE_AUTO_DISMISS_MS = 16000;
const ERROR_NUDGE_COOLDOWN_MS = 45000;

export function HrAgentAssistant() {
  const location = useLocation();
  const routeHint = useMemo(() => getModuleHintForPath(location.pathname), [location.pathname]);
  const { context } = useAgentContext(routeHint?.module ?? 'hr');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastErrorNudgeAtRef = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Page nudge: greet with the page-specific persona on every navigation to
  // a recognised page (not gated -- the user asked for this every time).
  useEffect(() => {
    if (!routeHint || open) return;
    const showTimer = window.setTimeout(() => {
      setNudge((cur) => (cur?.kind === 'error' ? cur : { kind: 'page', ...routeHint }));
    }, NUDGE_SHOW_DELAY_MS);
    return () => window.clearTimeout(showTimer);
  }, [routeHint, open]);

  // Error nudge: proactively offer help after any error toast, rate-limited.
  useEffect(() => {
    return subscribeToUserFacingError((detail) => {
      if (open) return;
      const now = Date.now();
      if (now - lastErrorNudgeAtRef.current < ERROR_NUDGE_COOLDOWN_MS) return;
      lastErrorNudgeAtRef.current = now;
      setNudge({ kind: 'error', message: detail.message });
    });
  }, [open]);

  useEffect(() => {
    if (!nudge) return;
    const ms = nudge.kind === 'error' ? ERROR_NUDGE_AUTO_DISMISS_MS : PAGE_NUDGE_AUTO_DISMISS_MS;
    const hideTimer = window.setTimeout(() => setNudge((cur) => (cur === nudge ? null : cur)), ms);
    return () => window.clearTimeout(hideTimer);
  }, [nudge]);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || !context || sending) return;
      setInput('');
      const userMsg: DisplayMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);
      try {
        const history: AgentChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
        const response = await askAgent({ message: text, history, context });
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: response.reply, proposedActions: response.proposedActions }
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: "I couldn't reach the assistant right now. Please try again." }
        ]);
      } finally {
        setSending(false);
      }
    },
    [input, context, sending, messages]
  );

  const confirmAction = useCallback(
    async (messageId: string, action: AgentProposedAction) => {
      if (!context) return;
      setConfirmingId(action.id);
      try {
        const result = await confirmAgentAction({ action, context });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, actionResults: { ...(m.actionResults ?? {}), [action.id]: { ok: result.ok, message: result.message } } }
              : m
          )
        );
      } finally {
        setConfirmingId(null);
      }
    },
    [context]
  );

  const openFromPageNudge = useCallback(
    (pageNudge: PageNudge) => {
      const starter = STARTER_QUESTION_BY_MODULE[pageNudge.module];
      setNudge(null);
      setOpen(true);
      if (starter && messages.length === 0) void send(starter);
    },
    [messages.length, send]
  );

  const openFromErrorNudge = useCallback(
    (errorNudge: ErrorNudge) => {
      setNudge(null);
      setOpen(true);
      void send(`I just got this error: "${errorNudge.message}". Can you help me understand what happened or what to do next?`);
    },
    [send]
  );

  if (!context) return null;

  const headerPersona = nudge?.kind === 'page' ? nudge.persona : routeHint?.persona;

  return (
    <>
      <style>{`
        @keyframes sca-nudge-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sca-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(13, 148, 108, 0.5); }
          70% { box-shadow: 0 0 0 14px rgba(13, 148, 108, 0); }
          100% { box-shadow: 0 0 0 0 rgba(13, 148, 108, 0); }
        }
        @keyframes sca-badge-pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .sca-nudge-bubble { animation: sca-nudge-in 280ms cubic-bezier(0.16, 1, 0.3, 1); }
        .sca-nudge-pulse { animation: sca-pulse-ring 1.8s ease-out infinite; }
        .sca-badge-pop { animation: sca-badge-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>

      {nudge && !open && (
        <div className="fixed bottom-24 right-24 z-[60] w-[calc(100vw-7rem)] max-w-[300px] sca-nudge-bubble">
          <div
            className={`relative overflow-hidden rounded-2xl rounded-br-sm border bg-white p-3.5 shadow-2xl ${
              nudge.kind === 'error' ? 'border-warning/40' : 'border-teal-200'
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 ${nudge.kind === 'error' ? 'bg-warning' : 'bg-gradient-to-r from-teal-500 to-emerald-400'}`} />
            <button
              onClick={() => setNudge(null)}
              className="absolute right-1.5 top-2.5 rounded-full p-0.5 text-charcoal-400 hover:bg-surface-100 hover:text-charcoal-600"
              aria-label="Dismiss suggestion"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>

            {nudge.kind === 'page' ? (
              <>
                <div className="flex items-start gap-2.5 pr-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-sm">
                    <SparklesIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">👋 I'm the {nudge.persona}</p>
                    <p className="mt-0.5 text-xs text-charcoal-500">I can answer questions and help draft things for {nudge.label} right here.</p>
                  </div>
                </div>
                <button
                  onClick={() => openFromPageNudge(nudge)}
                  className="mt-2.5 w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                >
                  Ask the {nudge.persona}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2.5 pr-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning text-white shadow-sm">
                    <AlertTriangleIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Looks like something went wrong</p>
                    <p className="mt-0.5 text-xs text-charcoal-500">Want me to help work out what happened, or what to try next?</p>
                  </div>
                </div>
                <button
                  onClick={() => openFromErrorNudge(nudge)}
                  className="mt-2.5 w-full rounded-lg bg-warning px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                >
                  Help me with this
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed bottom-24 right-24 z-[60] flex max-h-[76vh] w-[calc(100vw-7rem)] max-w-[410px] flex-col overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-teal-700 to-emerald-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <SparklesIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">{headerPersona ?? 'AI Assistant'}</p>
                <p className="text-xs text-teal-100 leading-tight">{routeHint ? routeHint.label : 'HR, Safety, Quality, and more'}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/15" aria-label="Close assistant">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-charcoal-500">
                Try: "What's my leave balance?", "How many open incidents this month?", "Any NCRs overdue?", "Outstanding
                training?", or "Any legal requirements overdue?"
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-teal-600 to-emerald-500 px-3 py-2 text-sm text-white shadow-sm'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-100 px-3 py-2 text-sm text-charcoal-800'
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.proposedActions?.map((action) => {
                    const result = m.actionResults?.[action.id];
                    return (
                      <div key={action.id} className="mt-2 rounded-lg border border-surface-300 bg-white p-2">
                        <p className="text-xs font-medium text-charcoal-700">{action.summary}</p>
                        {result ? (
                          <p className={`mt-1 text-xs ${result.ok ? 'text-success' : 'text-critical'}`}>{result.message}</p>
                        ) : (
                          <button
                            onClick={() => confirmAction(m.id, action)}
                            disabled={confirmingId === action.id}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
                          >
                            {confirmingId === action.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <CheckIcon className="h-3 w-3" />}
                            {action.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-charcoal-500">
                <Loader2Icon className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-surface-200 px-3 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask the assistant..."
              className="flex-1 rounded-full border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              aria-label="Send"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setNudge(null);
          setOpen((v) => !v);
        }}
        className={`fixed bottom-5 right-24 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-2xl transition hover:scale-105 hover:shadow-teal-500/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
          nudge && !open ? 'sca-nudge-pulse' : ''
        }`}
        aria-label="Open AI Assistant"
      >
        <SparklesIcon className="h-6 w-6" />
        {nudge && !open && (
          <span className="sca-badge-pop absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-warning text-[9px] font-bold text-white">
            !
          </span>
        )}
      </button>
    </>
  );
}
