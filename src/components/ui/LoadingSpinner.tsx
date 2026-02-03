import React from 'react';

export function LoadingSpinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-white/40 border-t-white animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

