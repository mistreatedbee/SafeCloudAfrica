import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { DownloadIcon, EyeIcon, FileWarningIcon } from 'lucide-react';
import { ensureInsforgeSession } from '../api/insforge/ensureSession';
import { Layout } from '../components/layout/Layout';
import { readEditorConfigResponse, toFriendlyEditorMessage } from './documentEditorResponse';

function loadOnlyofficeApi(docServerOrigin: string): Promise<void> {
  const src = `${docServerOrigin.replace(/\/+$/, '')}/web-apps/apps/api/documents/api.js`;

  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.DocsAPI && w.DocsAPI.DocEditor) return Promise.resolve();

  const existing = document.querySelector(`script[data-onlyoffice-api="1"][src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load ONLYOFFICE API script.')));
    });
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.onlyofficeApi = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ONLYOFFICE API script.'));
    document.body.appendChild(s);
  });
}

export function DocumentEditorPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const [searchParams] = useSearchParams();
  const mode = String(searchParams.get('mode') || 'view') === 'edit' ? 'edit' : 'view';
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fallbackFileUrl, setFallbackFileUrl] = React.useState<string | null>(null);
  const [fallbackDownloadUrl, setFallbackDownloadUrl] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [setupHint, setSetupHint] = React.useState<string | null>(null);

  const containerId = React.useMemo(() => `onlyoffice-doceditor-${versionId || 'unknown'}`, [versionId]);
  const editorRef = React.useRef<any>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!versionId) {
        setError('Missing document version id.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setFallbackFileUrl(null);
      setFallbackDownloadUrl(null);
      setFileName(null);
      setSetupHint(null);
      try {
        const { accessToken } = await ensureInsforgeSession({ reason: 'dms_onlyoffice_editor' });
        const res = await fetch(`/api/documents/editor-config?versionId=${encodeURIComponent(versionId)}&mode=${encodeURIComponent(mode)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        const payload = await readEditorConfigResponse(res);
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Failed to load editor config.');
        setFallbackFileUrl(payload.fileUrl || null);
        setFallbackDownloadUrl(payload.downloadUrl || payload.fileUrl || null);
        setFileName(payload.fileName || null);
        if (payload.editorAvailable === false || !payload.docServerOrigin || !payload.config || !payload.token) {
          if (String(payload.error || '').toLowerCase().includes('onlyoffice_docserver_origin')) {
            setSetupHint('Required Vercel environment variable: ONLYOFFICE_DOCSERVER_ORIGIN=https://your-onlyoffice-server-url');
          }
          setError(payload.friendlyError || toFriendlyEditorMessage(payload.error));
          setLoading(false);
          return;
        }
        if (cancelled) return;

        await loadOnlyofficeApi(payload.docServerOrigin);
        if (cancelled) return;

        const w = window as any;
        if (!w.DocsAPI || !w.DocsAPI.DocEditor) throw new Error('ONLYOFFICE DocEditor API not available.');

        // Dispose previous editor instance if the user navigates between versions.
        try {
          editorRef.current?.destroyEditor?.();
        } catch {}

        const config = { ...(payload.config || {}), token: payload.token };
        editorRef.current = new w.DocsAPI.DocEditor(containerId, config);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        const message = String(e?.message || e);
        if (message.toLowerCase().includes('onlyoffice_docserver_origin')) {
          setSetupHint('Required Vercel environment variable: ONLYOFFICE_DOCSERVER_ORIGIN=https://your-onlyoffice-server-url');
        }
        setError(toFriendlyEditorMessage(message));
        setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor?.();
      } catch {}
      editorRef.current = null;
    };
  }, [versionId, mode, containerId]);

  return (
    <Layout title={`Document editor (${mode})`}>
      {loading && (
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <p className="text-sm text-charcoal-500">Loading editor…</p>
        </div>
      )}
      {error && (
        <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-critical/10 p-2 text-critical">
              <FileWarningIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-critical">Unable to open editor</p>
              <p className="text-sm text-charcoal-500 mt-1">{error}</p>
              {setupHint ? <p className="text-xs text-charcoal-400 mt-2">{setupHint}</p> : null}
            </div>
          </div>
          {(fallbackFileUrl || fallbackDownloadUrl) && (
            <div className="flex flex-wrap items-center gap-2">
              {fallbackFileUrl && (
                <button
                  type="button"
                  onClick={() => window.open(fallbackFileUrl, '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  <EyeIcon className="w-4 h-4" />
                  View file
                </button>
              )}
              {fallbackDownloadUrl && (
                <a
                  href={fallbackDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={fileName || undefined}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900 text-white text-sm font-medium hover:bg-surface-800"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Download file
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden"
        style={{ height: 'calc(100dvh - var(--header-height) - 2rem)' }}
      >
        <div id={containerId} className="w-full h-full min-h-[640px]" />
      </div>
    </Layout>
  );
}
