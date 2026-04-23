import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ensureInsforgeSession } from '../api/insforge/ensureSession';
import { Layout } from '../components/layout/Layout';

type EditorConfigResponse = {
  ok: boolean;
  docServerOrigin: string;
  config: any;
  token: string;
  error?: string;
};

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
      try {
        const { accessToken } = await ensureInsforgeSession({ reason: 'dms_onlyoffice_editor' });
        const res = await fetch(`/api/documents/editor-config?versionId=${encodeURIComponent(versionId)}&mode=${encodeURIComponent(mode)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        const payload = (await res.json()) as EditorConfigResponse;
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Failed to load editor config.');
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
        setError(String(e?.message || e));
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
        <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
          <p className="text-sm font-semibold text-critical">Unable to open editor</p>
          <p className="text-sm text-charcoal-500 mt-1">{error}</p>
        </div>
      )}
      <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div id={containerId} className="w-full min-h-[75vh]" />
      </div>
    </Layout>
  );
}

