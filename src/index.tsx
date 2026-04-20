import './index.css';
import { createRoot } from 'react-dom/client';
import { InsforgeProvider } from '@insforge/react';
import { App } from './App';
import { insforge, insforgeReady } from './api/insforge/client';
import { ErrorBoundary } from './components/ErrorBoundary';

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
