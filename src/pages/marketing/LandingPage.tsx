import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CloudIcon,
  ShieldCheckIcon,
  FileTextIcon,
  ClipboardCheckIcon,
  AlertTriangleIcon,
  GraduationCapIcon,
  ScaleIcon,
  BarChart3Icon,
  SparklesIcon
} from 'lucide-react';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const item = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function scrollToHash(hash: string) {
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) scrollToHash(location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-surface-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-700">
              <CloudIcon className="w-6 h-6 text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-bold text-navy">Safe Cloud</p>
              <p className="text-xs text-teal font-medium">Africa</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-charcoal-500">
            <button onClick={() => scrollToHash('#modules')} className="hover:text-charcoal transition-colors">
              Modules
            </button>
            <button onClick={() => scrollToHash('#features')} className="hover:text-charcoal transition-colors">
              Features
            </button>
            <button onClick={() => scrollToHash('#pricing')} className="hover:text-charcoal transition-colors">
              Pricing
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-charcoal hover:bg-surface-100 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
            >
              Get started <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-teal/15 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-navy/10 blur-3xl rounded-full" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <motion.div variants={container} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <motion.p
                variants={item}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold"
              >
                <SparklesIcon className="w-4 h-4" />
                Integrated Digital Safety Management Programme (IDSMP)
              </motion.p>

              <motion.h1 variants={item} className="mt-5 text-4xl sm:text-5xl font-bold text-navy leading-tight">
                One system. <span className="text-teal">Total safety control.</span>
              </motion.h1>

              <motion.p variants={item} className="mt-4 text-base text-charcoal-500 max-w-xl">
                Safe Cloud Africa is a cloud-based, ISO-aligned platform built to manage documents, tasks, incidents,
                training, audits, risks, approvals, and compliance scoring—end to end.
              </motion.p>

              <motion.div variants={item} className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 transition-colors"
                >
                  Login / Get started <ArrowRightIcon className="w-4 h-4" />
                </Link>
                <a
                  href="#modules"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white border border-surface-300 text-charcoal font-semibold hover:bg-surface-50 transition-colors"
                >
                  View modules
                </a>
              </motion.div>

              <motion.div variants={item} className="mt-7 flex items-start gap-3 text-sm text-charcoal-500">
                <ShieldCheckIcon className="w-5 h-5 text-success mt-0.5" />
                <p>
                  Designed for <span className="font-semibold text-charcoal">auditability</span>, evidence storage, and long-term scalability
                  (ISO 45001 / 9001 / 14001).
                </p>
              </motion.div>
            </div>

            <motion.div variants={item} className="bg-white rounded-2xl border border-surface-300 shadow-card p-6">
              <p className="text-sm font-semibold text-charcoal">What the platform helps you do</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <FileTextIcon className="w-5 h-5 text-teal" /> Document control
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Versions, approvals, review dates, audit trail.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <ClipboardCheckIcon className="w-5 h-5 text-teal" /> Tasks & time
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Plan, assign, track time and completion.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <AlertTriangleIcon className="w-5 h-5 text-warning" /> Incidents & CAPA
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Report, investigate, corrective actions.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <GraduationCapIcon className="w-5 h-5 text-teal" /> Training & competency
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Matrix, expiry reminders, certificates.</p>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-xl bg-navy text-white">
                <p className="text-sm font-semibold">Aligned to ISO clauses (Annex SL)</p>
                <p className="text-sm text-navy-200 mt-1">
                  Each module maps to clauses for planning, operational control, performance evaluation, and improvement.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="bg-white border-t border-surface-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold text-navy">Core modules</h2>
              <p className="text-sm text-charcoal-500 mt-2">
                Built around Quality, Safety, Health, Legal, HR, and General—plus supporting modules for evidence and control.
              </p>
            </div>
            <Link to="/app" className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-teal hover:text-teal-700">
              Open the app <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: 'Documents (DMS)', icon: FileTextIcon, desc: 'Policies, procedures, registers, version control.' },
              { title: 'Tasks & Time', icon: ClipboardCheckIcon, desc: 'Inspections, toolbox talks, time tracking.' },
              { title: 'Incidents & CAPA', icon: AlertTriangleIcon, desc: 'Near misses, investigations, corrective actions.' },
              { title: 'Training & Competency', icon: GraduationCapIcon, desc: 'Training matrix, expiry alerts, certificates.' },
              { title: 'Audits & Inspections', icon: BarChart3Icon, desc: 'Checklists, findings, evidence uploads.' },
              { title: 'Legal Register', icon: ScaleIcon, desc: 'Compliance obligations linked to evidence and actions.' }
            ].map((m) => (
              <div key={m.title} className="bg-surface-50 border border-surface-200 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-surface-200">
                    <m.icon className="w-5 h-5 text-teal" />
                  </div>
                  <p className="font-semibold text-charcoal">{m.title}</p>
                </div>
                <p className="mt-2 text-sm text-charcoal-500">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="text-2xl font-bold text-navy">Built for South African organisations</h2>
        <p className="text-sm text-charcoal-500 mt-2 max-w-3xl">
          African-first, cloud-based, and designed for real-world operational control—without the admin headache.
        </p>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6">
            <p className="font-semibold text-charcoal">Organisation & user management</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Role-based access control, user onboarding, and organisation settings built for SA SMEs and growing teams.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Secure by design</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6">
            <p className="font-semibold text-charcoal">Secure cloud storage + audit trails</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Store documents and evidence with activity tracking, approvals, and audit logs for defensible compliance.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Audit-ready</span>
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Privacy-aware</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6">
            <p className="font-semibold text-charcoal">Scalable infrastructure</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Built to grow from a small business to multi-site operations with reliable performance and structured data.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-teal-50 border border-teal/20 text-teal">Planned Upgrade</span>
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Advanced analytics</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-white border-t border-surface-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-2xl font-bold text-navy">Licensing model</h2>
          <p className="text-sm text-charcoal-500 mt-2 max-w-3xl">
            Choose a licence that matches your organisation size. All licences are priced in South African Rands (R).
          </p>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Starter Licence (6 Months)',
                price: 'R3,000 once-off',
                badge: 'Best for small businesses',
                bullets: [
                  'Access to core SafeCloud Africa platform',
                  'User & role management',
                  'Secure cloud storage (basic tier)',
                  'Activity tracking & audit logs',
                  'Email support'
                ]
              },
              {
                title: 'Professional Licence (12 Months)',
                price: 'R5,000 once-off',
                badge: 'Most popular',
                highlight: true,
                bullets: [
                  'Everything in Starter',
                  'Extended storage',
                  'Priority support',
                  'Organisation branding (logo & name)',
                  'Advanced monitoring features (Phase 2 feature)'
                ]
              },
              {
                title: 'Enterprise / Custom Licence',
                price: 'Request a quote',
                badge: 'Custom onboarding',
                bullets: [
                  'For larger organisations and multi-site operations',
                  'Custom features and configuration',
                  'Onboarding + training',
                  'Dedicated support options',
                  'Integrations (Coming soon / planned upgrades)'
                ]
              }
            ].map((p) => (
              <div
                key={p.title}
                className={`bg-surface-50 rounded-2xl border p-6 ${
                  p.highlight ? 'border-teal shadow-card' : 'border-surface-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-charcoal">{p.title}</p>
                  {p.badge && (
                    <span
                      className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                        p.highlight
                          ? 'bg-teal-50 text-teal border-teal/20'
                          : 'bg-white text-charcoal-500 border-surface-200'
                      }`}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-3xl font-bold text-navy">{p.price}</p>
                <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <ShieldCheckIcon className="w-4 h-4 text-success mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 bg-navy rounded-2xl p-6 text-white">
            <div>
              <p className="font-semibold">Ready to start?</p>
              <p className="text-sm text-navy-200 mt-1">Verify your email, then sign in to access the platform.</p>
            </div>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 transition-colors"
            >
              Get started <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

