import React from 'react';
import { CheckCircle2Icon, ShieldCheckIcon, SparklesIcon } from 'lucide-react';

export function AuthShell({
  title,
  subtitle,
  children,
  sideTitle = 'Safe Cloud Africa',
  sideBullets = [
    'Secure, cloud-based evidence storage',
    'Company isolation (multi-tenant)',
    'Role-based access (Admin / Consultant / Employee)',
    'Audit trails for defensible compliance',
    'Built for South African organisations'
  ]
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  sideTitle?: string;
  sideBullets?: string[];
}) {
  return (
    <div className="min-h-screen bg-surface relative overflow-hidden">
      {/* subtle background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-teal/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[520px] h-[520px] rounded-full bg-navy/10 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-surface-300 shadow-card p-6 sca-auth-shell">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Safe Cloud Africa" className="w-10 h-10 rounded-lg object-contain bg-white" />
              <div className="leading-tight">
                <p className="font-bold text-navy">Safe Cloud Africa</p>
                <p className="text-xs text-teal font-semibold">Integrated Digital Safety Management Programme (IDSMP)</p>
              </div>
            </div>

            <div className="mt-6">
              <h1 className="text-2xl font-bold text-navy">{title}</h1>
              <p className="text-sm text-charcoal-500 mt-1">{subtitle}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal/10 text-teal text-xs font-semibold">
                <ShieldCheckIcon className="w-4 h-4" /> POPIA-aware
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-navy/10 text-navy text-xs font-semibold">
                <CheckCircle2Icon className="w-4 h-4" /> ISO-aligned
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-100 text-charcoal text-xs font-semibold">
                <SparklesIcon className="w-4 h-4" /> Enterprise-ready
              </span>
            </div>

            <div className="mt-6 sca-auth-embed">{children}</div>
          </div>

          <div className="hidden lg:block bg-gradient-to-br from-navy to-navy-700 rounded-2xl p-8 text-white border border-navy/20 shadow-card">
            <p className="text-sm font-semibold text-navy-200">{sideTitle}</p>
            <h2 className="mt-2 text-3xl font-bold leading-tight">One system. Total safety control.</h2>
            <p className="mt-3 text-sm text-navy-200 max-w-md">
              Built to help organisations manage incidents, tasks, evidence, and compliance—securely, auditable, and scalable.
            </p>

            <div className="mt-6 space-y-2">
              {sideBullets.map((b) => (
                <div key={b} className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-teal flex-shrink-0" />
                  <p className="text-sm text-navy-100">{b}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 rounded-xl bg-white/10 border border-white/10">
              <p className="text-sm font-semibold">Privacy-aware by design</p>
              <p className="text-sm text-navy-200 mt-1">
                Data is isolated per company. Your users only see what they are permitted to see.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-white/10 border border-white/10">
                <p className="text-sm font-semibold">Fast onboarding</p>
                <p className="text-sm text-navy-200 mt-1">Create a company workspace in minutes.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/10 border border-white/10">
                <p className="text-sm font-semibold">Audit-ready exports</p>
                <p className="text-sm text-navy-200 mt-1">Generate reports and evidence packs.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

