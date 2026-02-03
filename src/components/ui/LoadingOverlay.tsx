import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

export function LoadingOverlay({
  show,
  title = 'Loading…',
  message = 'Please wait a moment.'
}: {
  show: boolean;
  title?: string;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />

      <div className="relative w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-elevated overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-teal via-teal-600 to-navy" />

          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-700 flex items-center justify-center">
                <LoadingSpinner className="w-5 h-5 border-white/30 border-t-white" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-navy">Safe Cloud Africa</p>
                <p className="text-xs text-charcoal-500">Integrated Digital Safety Management Programme (IDSMP)</p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-base font-bold text-charcoal">{title}</p>
              <p className="text-sm text-charcoal-500 mt-1">{message}</p>
            </div>

            <div className="mt-5 p-4 rounded-xl bg-surface-50 border border-surface-200">
              <div className="flex items-center gap-2 text-xs text-charcoal-500">
                <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                Securing your session and syncing workspace data…
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

