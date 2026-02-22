import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { USER_SIGNED_OUT_KEY } from '../../auth/AuthSessionListener';

export function LogoutPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        sessionStorage.setItem(USER_SIGNED_OUT_KEY, '1');
      } catch {
        // ignore
      }
      await signOut();
      navigate('/', { replace: true });
    })();
  }, [navigate, signOut]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-surface-300 shadow-card p-6 text-center">
        <p className="text-sm text-charcoal-500">Signing you out…</p>
      </div>
    </div>
  );
}

