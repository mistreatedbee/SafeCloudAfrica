import { useCallback, useRef, useState, useEffect } from 'react';
import { SparklesIcon, SendIcon, XIcon, Loader2Icon, CheckIcon } from 'lucide-react';

import { useAgentContext } from '../../ai/agentContext';
import { askAgent, confirmAgentAction } from '../../ai/agentClient';
import type { AgentChatMessage, AgentProposedAction } from '../../ai/agentTypes';

/**
 * Phase 1 floating entry point for the module-agent system. Separate from
 * FloatingSupportChat (support tickets) -- this is the AI assistant for
 * asking HR questions and drafting HR content, not a support-request flow.
 * Only renders once a company/role context resolves (useAgentContext), and
 * only shows if the signed-in member actually has an HR-relevant role
 * context available -- it still degrades gracefully (fallback replies) if
 * the AI call itself fails.
 */

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedActions?: AgentProposedAction[];
  actionResults?: Record<string, { ok: boolean; message: string }>;
};

export function HrAgentAssistant() {
  const { context } = useAgentContext('hr');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
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
  }, [input, context, sending, messages]);

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

  if (!context) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 left-5 z-[60] flex max-h-[76vh] w-[calc(100vw-2.5rem)] max-w-[410px] flex-col overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-elevated">
          <div className="flex items-center justify-between border-b border-surface-200 bg-teal-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">HR Assistant</p>
                <p className="text-xs text-teal-100 leading-tight">Ask about leave, reviews, and more</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-teal-800" aria-label="Close assistant">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-charcoal-500">
                Try: "What's my leave balance?", "Draft a performance review comment for [name]", or "Any outstanding document
                acknowledgements?"
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
              placeholder="Ask the HR assistant..."
              className="flex-1 rounded-full border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={send}
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
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-elevated transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        aria-label="Open HR Assistant"
      >
        <SparklesIcon className="h-6 w-6" />
      </button>
    </>
  );
}
