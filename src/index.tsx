import './index.css';
import { createRoot } from 'react-dom/client';
import { InsforgeProvider } from '@insforge/react';
import { App } from './App';
import { insforge } from './api/insforge/client';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <InsforgeProvider
    client={insforge}
    afterSignInUrl="/app"
    onSignIn={async (authToken) => {
      // Ensure all SDK database calls include the user's auth context for RLS.
      insforge.getHttpClient().setAuthToken(typeof authToken === 'string' && authToken ? authToken : null);
    }}
    onRefresh={async (authToken) => {
      // Keep token in sync across refreshes (magic links, session refresh, etc).
      insforge.getHttpClient().setAuthToken(typeof authToken === 'string' && authToken ? authToken : null);
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
