import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, XIcon } from 'lucide-react';
import { emitUserFacingError } from '../../api/liveData';

export type ToastTone = 'success' | 'error';

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

function toneClasses(tone: ToastTone): string {
  return tone === 'success'
    ? 'border-success/30 bg-white text-charcoal'
    : 'border-critical/30 bg-white text-charcoal';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = idRef.current++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const showSuccess = useCallback((message: string) => show('success', message), [show]);
  const showError = useCallback(
    (message: string) => {
      show('error', message);
      // Best-effort broadcast so the AI assistant can proactively offer
      // help -- never let this affect the toast itself.
      try {
        emitUserFacingError({ message });
      } catch {
        // ignore
      }
    },
    [show]
  );

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 shadow-xl ${toneClasses(toast.tone)}`}
          >
            {toast.tone === 'success' ? (
              <CheckCircleIcon className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircleIcon className="w-5 h-5 text-critical shrink-0 mt-0.5" />
            )}
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-charcoal-400 hover:text-charcoal shrink-0"
              aria-label="Dismiss notification"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}
