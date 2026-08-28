import { useState } from 'react';
import { SparklesIcon, Loader2Icon } from 'lucide-react';

type DraftResult = { ok: true; text: string } | { ok: false; message: string };

type AiDraftButtonProps = {
  /** Button label, e.g. "AI draft". Kept short -- this sits inline next to a form label. */
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  onDraft: () => Promise<DraftResult>;
  onResult: (text: string) => void;
};

/**
 * Small reusable "AI draft" trigger for inline-form suggestions -- the
 * counterpart to the floating chat assistant, embedded directly next to a
 * specific field (e.g. Manager remarks, Cause of incident). Calls onDraft(),
 * which is expected to be one of agentClient.ts's draft*() wrappers, and
 * hands the resulting text to onResult() for the form's own state/textarea
 * to own. This component never writes anything itself -- the form's
 * existing Save button remains the only thing that persists the field.
 */
export function AiDraftButton({ label = 'AI draft', disabled, disabledReason, onDraft, onResult }: AiDraftButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const result = await onDraft();
      if (result.ok) onResult(result.text);
      else setError(result.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        title={disabled ? disabledReason : 'Draft this with AI, grounded in this record\'s data -- review before saving'}
        className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <SparklesIcon className="h-3 w-3" />}
        {loading ? 'Drafting...' : label}
      </button>
      {error && <span className="text-[11px] text-critical">{error}</span>}
    </span>
  );
}
