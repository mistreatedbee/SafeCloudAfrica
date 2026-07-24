import './index.css';
import { createRoot } from 'react-dom/client';
import { InsforgeProvider } from '@insforge/react';
import { App } from './App';
import { insforge, insforgeReady } from './api/insforge/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { paaq } from './lib/paaq';

const PAAQ_SDK_TOKEN = import.meta.env.VITE_PAAQ_SDK_TOKEN ?? 'sdk_live_aa2vjr8nhh14hfqeax0ywx4euz7vg3b2';
const PAAQ_PROJECT_KEY = import.meta.env.VITE_PAAQ_PROJECT_KEY ?? 'proj_6u2h0ixg';

paaq.init(PAAQ_SDK_TOKEN, PAAQ_PROJECT_KEY).then((result) => {
  if (result.ok) {
    paaq.track('sdk_connected', { source: 'safe_cloud_africa', sdkVersion: '1.0.0' });
    console.log('[PAAQ] Connected — session:', result.sessionId);
  } else {
    console.warn('[PAAQ] Init failed:', result.error);
  }
});

const root = createRoot(document.getElementById('root')!);

function renderApp() {
  root.render(
    <InsforgeProvider
      client={insforge}
      afterSignInUrl="/app"
      onSignIn={async (authToken) => {
        // Ensure all SDK database calls include the user's auth context for RLS.
        insforge.getHttpClient().setAuthToken(authToken);
      }}
      onRefresh={async (authToken) => {
        // Keep token in sync across refreshes (magic links, session refresh, etc).
        insforge.getHttpClient().setAuthToken(authToken);
      }}
      onSignOut={async () => {
        insforge.getHttpClient().setAuthToken(null);
      }}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </InsforgeProvider>
  );
}

void insforgeReady.finally(() => {
  renderApp();
});
