import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, ShieldCheckIcon } from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';

export type AuthLoadingStage = 'session' | 'workspace' | 'ready';

const STEPS: Array<{ key: AuthLoadingStage; label: string }> = [
  { key: 'session', label: 'Verifying your session' },
  { key: 'workspace', label: 'Loading your organisation' },
  { key: 'ready', label: 'Preparing your dashboard' }
];

function stageIndex(stage: AuthLoadingStage): number {
  return STEPS.findIndex((s) => s.key === stage);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Full-screen branded loading state shown while the auth session and tenant
 * (company/membership) data resolve after login -- replaces a bare spinner so
 * the wait (session bootstrap + membership fetch, sometimes a couple seconds)
 * reads as visible progress instead of a stall.
 */
export function AuthLoadingScreen({ stage }: { stage: AuthLoadingStage }) {
  // Both hooks are safe to call unconditionally here even before their data has
  // resolved -- IdentityProvider/TenantProvider already return sensible defaults
  // ('User', 'Your organisation', etc.) until the real values load.
  const { fullName, email, organisationName, roleLabel, avatarUrl } = useIdentity();
  const { isTenantLoaded } = useTenant();

  const currentIndex = stageIndex(stage);
  const showWorkspaceCard = stage === 'workspace' || stage === 'ready';
  const showOrgDetails = showWorkspaceCard && isTenantLoaded;

  return (
    <div className="min-h-screen bg-surface relative overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-teal/10 blur-3xl"
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -right-24 w-[520px] h-[520px] rounded-full bg-navy/10 blur-3xl"
          animate={{ opacity: [0.9, 0.5, 0.9] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-sm bg-white/95 backdrop-blur rounded-2xl border border-surface-300 shadow-card p-6"
      >
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Safe Cloud Africa" className="w-10 h-10 rounded-lg object-contain bg-white" />
          <div className="leading-tight">
            <p className="font-bold text-navy">Safe Cloud Africa</p>
            <p className="text-xs text-teal font-semibold">Signing you in…</p>
          </div>
        </div>

        {/* Identity reveal: name/email appear as soon as the auth session resolves,
            org + role fade in once tenant/membership data lands. */}
        <div className="mt-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-navy text-white flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsFor(fullName)
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-charcoal truncate">{fullName}</p>
            <p className="text-xs text-charcoal-500 truncate">{email}</p>
          </div>
        </div>

        <AnimatePresence>
          {showOrgDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl bg-surface-50 border border-surface-200 px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-charcoal-500">Organisation</p>
                  <p className="text-sm font-semibold text-navy truncate">{organisationName}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-teal/10 text-teal text-xs font-semibold">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  {roleLabel}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step checklist */}
        <div className="mt-5 space-y-2.5">
          {STEPS.map((step, idx) => {
            const done = idx < currentIndex || (idx === currentIndex && stage === 'ready');
            const active = idx === currentIndex && stage !== 'ready';
            return (
              <div key={step.key} className="flex items-center gap-2.5">
                <span
                  className={`relative w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    done ? 'bg-teal' : active ? 'bg-teal/10 border-2 border-teal' : 'bg-surface-200'
                  }`}
                >
                  {done && <CheckIcon className="w-3 h-3 text-white" strokeWidth={3} />}
                  {active && (
                    <motion.span
                      className="absolute inset-0 rounded-full border-2 border-teal border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </span>
                <span className={`text-xs font-medium ${done || active ? 'text-charcoal' : 'text-charcoal-400'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-1.5 rounded-full bg-surface-200 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-teal to-navy"
            initial={{ width: '10%' }}
            animate={{ width: `${Math.min(100, ((currentIndex + 1) / STEPS.length) * 100)}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </motion.div>
    </div>
  );
}
