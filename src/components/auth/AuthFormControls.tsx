import React, { useMemo, useState } from 'react';

export function AuthTextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className, ...inputProps } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-charcoal">{label}</span>
      <input
        {...inputProps}
        className={`w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm text-charcoal outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 ${className ?? ''}`}
      />
    </label>
  );
}

export function AuthPasswordInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }
) {
  const { label, className, ...inputProps } = props;
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-charcoal">{label}</span>
      <div className="relative">
        <input
          {...inputProps}
          type={visible ? 'text' : 'password'}
          className={`w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 pr-20 text-sm text-charcoal outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 ${className ?? ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-2 my-auto rounded px-2 py-1 text-xs font-semibold text-charcoal-500 hover:bg-surface-100"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  );
}

export function AuthSubmitButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingText?: string }
) {
  const { children, className, disabled, loading = false, loadingText, ...buttonProps } = props;
  const content = useMemo(() => (loading && loadingText ? loadingText : children), [children, loading, loadingText]);

  return (
    <button
      {...buttonProps}
      disabled={disabled}
      className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70 ${className ?? ''}`}
    >
      {content}
    </button>
  );
}

export function AuthMessage(props: { tone: 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const classes =
    props.tone === 'error'
      ? 'border-critical/20 bg-critical/10 text-critical'
      : props.tone === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-amber-200 bg-amber-50 text-amber-800';

  return <div className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>{props.children}</div>;
}

type AuthOAuthButtonsProps = {
  disabled?: boolean;
  loadingProvider?: string | null;
  providers: string[];
  onClick: (provider: string) => void;
};

function labelForProvider(provider: string): string {
  const lowered = provider.toLowerCase();
  if (lowered === 'google') return 'Google';
  if (lowered === 'github') return 'GitHub';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function AuthOAuthButtons(props: AuthOAuthButtonsProps) {
  if (!props.providers.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-300" />
        <span className="text-xs font-medium uppercase tracking-wide text-charcoal-400">or continue with</span>
        <div className="h-px flex-1 bg-surface-300" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {props.providers.map((provider) => {
          const normalized = provider.toLowerCase();
          const isLoading = props.loadingProvider === normalized;
          return (
            <button
              key={provider}
              type="button"
              disabled={props.disabled}
              onClick={() => props.onClick(normalized)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-charcoal transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? `Connecting to ${labelForProvider(normalized)}...` : `Continue with ${labelForProvider(normalized)}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
