import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { SparklesIcon, SendIcon, XIcon, Loader2Icon, CheckIcon } from 'lucide-react';

import { useAgentContext } from '../../ai/agentContext';
import { askAgent, confirmAgentAction } from '../../ai/agentClient';
import type { AgentChatMessage, AgentProposedAction } from '../../ai/agentTypes';
import { getModuleHintForPath, STARTER_QUESTION_BY_MODULE } from '../../ai/routeModuleHint';

/**
 * Floating entry point for the module-agent system. Separate from
 * FloatingSupportChat (support tickets) -- this is the AI assistant for
 * asking questions and drafting content across modules, not a
 * support-request flow. Only renders once a company/role context resolves
 * (useAgentContext), and still degrades gracefully (fallback replies) if
 * the AI call itself fails.
 *
 * Route-aware nudge: on landing on a page that maps to a known module
 * (routeModuleHint.ts), a small dismissible bubble appears near the button
 * once per browser session per module, naming what the assistant can help
 * with there and offering a one-click starter question -- this also means
 * the assistant defaults to the *right* specialist agent for the page the
 * user is actually on, instead of always guessing 'hr'.
 */

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedActions?: AgentProposedAction[];
  actionResults?: Record<string, { ok: boolean; message: string }>;
};

const NUDGE_SEEN_PREFIX = 'sca_ai_nudge_seen_';
const NUDGE_SHOW_DELAY_MS = 1400;
const NUDGE_AUTO_DISMISS_MS = 12000;

function hasSeenNudge(module: string): boolean {
  try {
    return sessionStorage.getItem(NUDGE_SEEN_PREFIX + module) === '1';
  } catch {
    return true; // storage unavailable -- don't nudge repeatedly if we can't remember we did
  }
}

function markNudgeSeen(module: string): void {
  try {
    sessionStorage.setItem(NUDGE_SEEN_PREFIX + module, '1');
  } catch {
    // ignore -- private browsing / storage blocked
  }
}

export function HrAgentAssistant() {
  const location = useLocation();
  const routeHint = useMemo(() => getModuleHintForPath(location.pathname), [location.pathname]);
  const { context } = useAgentContext(routeHint?.module ?? 'hr');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [nudge, setNudge] = useState<{ module: string; label: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Show a one-time-per-session nudge for the module the user just landed on.
  useEffect(() => {
    if (!routeHint || open) return;
    if (hasSeenNudge(routeHint.module)) return;
    const showTimer = window.setTimeout(() => setNudge(routeHint), NUDGE_SHOW_DELAY_MS);
    return () => window.clearTimeout(showTimer);
  }, [routeHint, open]);

  useEffect(() => {
    if (!nudge) return;
    markNudgeSeen(nudge.module);
    const hideTimer = window.setTimeout(() => setNudge((cur) => (cur?.module === nudge.module ? null : cur)), NUDGE_AUTO_DISMISS_MS);
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

  const openFromNudge = useCallback(() => {
    const starter = nudge ? STARTER_QUESTION_BY_MODULE[nudge.module] : undefined;
    setNudge(null);
    setOpen(true);
    if (starter && messages.length === 0) {
      void send(starter);
    }
  }, [nudge, messages.length, send]);

  if (!context) return null;

  return (
    <>
      <style>{`
        @keyframes sca-nudge-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sca-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(13, 148, 108, 0.45); }
          70% { box-shadow: 0 0 0 12px rgba(13, 148, 108, 0); }
          100% { box-shadow: 0 0 0 0 rgba(13, 148, 108, 0); }
        }
        .sca-nudge-bubble { animation: sca-nudge-in 260ms ease-out; }
        .sca-nudge-pulse { animation: sca-pulse-ring 1.8s ease-out infinite; }
      `}</style>

      {nudge && !open && (
        <div className="fixed bottom-24 left-5 z-[60] max-w-[280px] sca-nudge-bubble">
          <div className="relative rounded-2xl rounded-bl-sm border border-teal-200 bg-white p-3 shadow-elevated">
            <button
              onClick={() => setNudge(null)}
              className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-charcoal-400 hover:bg-surface-100 hover:text-charcoal-600"
              aria-label="Dismiss suggestion"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-start gap-2 pr-4">
              <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <p className="text-xs text-charcoal-700">
                Need a hand with <span className="font-semibold">{nudge.label}</span>? I can answer questions and help draft
                things right here.
              </p>
            </div>
            <button
              onClick={openFromNudge}
              className="mt-2 w-full rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Ask about {nudge.label}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed bottom-24 left-5 z-[60] flex max-h-[76vh] w-[calc(100vw-2.5rem)] max-w-[410px] flex-col overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-elevated">
          <div className="flex items-center justify-between border-b border-surface-200 bg-teal-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">AI Assistant</p>
                <p className="text-xs text-teal-100 leading-tight">
                  {routeHint ? `Ready to help with ${routeHint.label}` : 'HR, Safety, Quality, and more'}
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-teal-800" aria-label="Close assistant">
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
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-teal-700 px-3 py-2 text-sm text-white'
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
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
        className={`fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-elevated transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
          nudge && !open ? 'sca-nudge-pulse' : ''
        }`}
        aria-label="Open AI Assistant"
      >
        <SparklesIcon className="h-6 w-6" />
      </button>
    </>
  );
}
