import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';

export function RequireSignedIn({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 w-full max-w-md">
          <p className="text-sm font-semibold text-charcoal">Loading…</p>
          <p className="text-sm text-charcoal-500 mt-1">Preparing your session.</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
}

