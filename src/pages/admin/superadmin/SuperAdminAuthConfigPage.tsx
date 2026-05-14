import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyIcon, PlusIcon, Trash2Icon, Loader2Icon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react';
import { readStoredAccessToken } from '../../../api/insforge/sessionState';
import { getNoStoreHeaders } from '../../../api/liveData';

type AuthConfig = {
  verifyEmailMethod: 'code' | 'link';
  resetPasswordMethod: 'code' | 'link';
  allowedRedirectUrls: string[] | null;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function getAuthHeaders(): Record<string, string> {
  const token = readStoredAccessToken();
  const base = Object.fromEntries(getNoStoreHeaders().entries());
  return token ? { ...base, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { ...base, 'Content-Type': 'application/json' };
}

async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/auth/config', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to load auth config (${res.status})`);
  return res.json() as Promise<AuthConfig>;
}

async function saveAuthConfig(patch: Partial<AuthConfig>): Promise<void> {
  const res = await fetch('/api/auth/config', {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? `Save failed (${res.status})`);
  }
}

export function SuperAdminAuthConfigPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fixingNow, setFixingNow] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    fetchAuthConfig()
      .then((cfg) => setConfig({
        ...cfg,
        allowedRedirectUrls: cfg.allowedRedirectUrls ?? [],
      }))
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveAuthConfig({
        verifyEmailMethod: config.verifyEmailMethod,
        resetPasswordMethod: config.resetPasswordMethod,
        allowedRedirectUrls: config.allowedRedirectUrls?.length ? config.allowedRedirectUrls : null,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveStatus('error');
    }
  };

  const addUrl = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setUrlError('URL must start with http:// or https://');
      return;
    }
    if (config?.allowedRedirectUrls?.includes(trimmed)) {
      setUrlError('URL already in list');
      return;
    }
    setUrlError('');
    setConfig((prev) => prev ? { ...prev, allowedRedirectUrls: [...(prev.allowedRedirectUrls ?? []), trimmed] } : prev);
    setNewUrl('');
  };

  const removeUrl = (url: string) => {
    setConfig((prev) => prev ? { ...prev, allowedRedirectUrls: (prev.allowedRedirectUrls ?? []).filter((u) => u !== url) } : prev);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-charcoal-500 py-10">
        <Loader2Icon className="w-4 h-4 animate-spin" />
        Loading auth configuration…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-critical/10 px-4 py-3 text-sm text-critical">
        {loadError}
      </div>
    );
  }

  if (!config) return null;

  const isBroken =
    config.verifyEmailMethod === 'link' &&
    (!config.allowedRedirectUrls || config.allowedRedirectUrls.length === 0);

  const handleFixNow = async () => {
    setFixingNow(true);
    try {
      await saveAuthConfig({ verifyEmailMethod: 'code' });
      setConfig((prev) => prev ? { ...prev, verifyEmailMethod: 'code' } : prev);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveStatus('error');
    } finally {
      setFixingNow(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <KeyIcon className="w-5 h-5 text-teal" />
        <h2 className="text-lg font-semibold text-charcoal">Auth Configuration</h2>
      </div>
      <p className="text-sm text-charcoal-500">
        Manage InsForge authentication settings. Changes apply immediately to all signup and password-reset flows.
      </p>

      {isBroken && (
        <div className="rounded-xl border border-critical/40 bg-critical/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-critical shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-critical">Registration is broken</p>
              <p className="text-sm text-critical/90 mt-0.5">
                Email verification is set to <strong>link</strong> mode but no redirect URLs are
                allowlisted. Every signup attempt fails with 400. Click below to fix immediately.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFixNow}
            disabled={fixingNow}
            className="inline-flex items-center gap-2 rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 disabled:pointer-events-none"
          >
            {fixingNow ? (
              <><Loader2Icon className="w-4 h-4 animate-spin" /> Applying fix…</>
            ) : (
              'Switch to code (OTP) verification →'
            )}
          </button>
        </div>
      )}

      {/* Email verification method */}
      <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-charcoal">Email verification method</h3>
        <p className="text-xs text-charcoal-500">
          <strong>Code (OTP):</strong> User receives a 6-digit code and enters it in-app. No redirect URL required.<br />
          <strong>Link:</strong> User receives a clickable link. The destination URL must be in the allowed redirect URLs list.
        </p>
        <div className="flex gap-3">
          {(['code', 'link'] as const).map((method) => (
            <label key={method} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="verifyEmailMethod"
                value={method}
                checked={config.verifyEmailMethod === method}
                onChange={() => setConfig((prev) => prev ? { ...prev, verifyEmailMethod: method } : prev)}
                className="accent-teal"
              />
              <span className="text-sm text-charcoal capitalize">{method}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Reset password method */}
      <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-charcoal">Password reset method</h3>
        <p className="text-xs text-charcoal-500">
          <strong>Code (OTP):</strong> User receives a 6-digit code to exchange for a reset token.<br />
          <strong>Link:</strong> User receives a clickable link. Destination must be in the allowed redirect URLs list.
        </p>
        <div className="flex gap-3">
          {(['code', 'link'] as const).map((method) => (
            <label key={method} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="resetPasswordMethod"
                value={method}
                checked={config.resetPasswordMethod === method}
                onChange={() => setConfig((prev) => prev ? { ...prev, resetPasswordMethod: method } : prev)}
                className="accent-teal"
              />
              <span className="text-sm text-charcoal capitalize">{method}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Allowed redirect URLs */}
      <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-charcoal">Allowed redirect URLs</h3>
        <p className="text-xs text-charcoal-500">
          URLs that can be used as redirect destinations in email verification and password reset links.
          Required when either method above is set to <strong>Link</strong>. Wildcards like
          <code className="mx-1 px-1 bg-surface-100 rounded">https://*.example.com</code> are supported.
        </p>

        <ul className="space-y-2">
          {(config.allowedRedirectUrls ?? []).length === 0 && (
            <li className="text-sm text-charcoal-400 italic">No URLs configured.</li>
          )}
          {(config.allowedRedirectUrls ?? []).map((url) => (
            <li key={url} className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm">
              <span className="text-charcoal font-mono break-all">{url}</span>
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="shrink-0 text-charcoal-400 hover:text-critical transition-colors"
                aria-label={`Remove ${url}`}
              >
                <Trash2Icon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => { setNewUrl(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
            placeholder="https://safecloudafrica.co.za/app"
            className="flex-1 rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal font-mono"
          />
          <button
            type="button"
            onClick={addUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" /> Add
          </button>
        </div>
        {urlError && <p className="text-xs text-critical">{urlError}</p>}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-60 disabled:pointer-events-none"
        >
          {saveStatus === 'saving' ? (
            <><Loader2Icon className="w-4 h-4 animate-spin" /> Saving…</>
          ) : 'Save changes'}
        </button>
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <CheckCircle2Icon className="w-4 h-4" /> Saved
          </span>
        )}
        {saveStatus === 'error' && saveError && (
          <span className="text-sm text-critical">{saveError}</span>
        )}
      </div>
    </motion.div>
  );
}
