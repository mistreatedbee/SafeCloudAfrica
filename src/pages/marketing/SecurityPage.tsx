import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CloudIcon,
  ShieldCheckIcon,
  UsersIcon,
  FileTextIcon,
  LockIcon,
  ServerIcon,
  HeartIcon
} from 'lucide-react';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export function SecurityPage() {
  return (
    <div className="min-h-screen bg-surface">
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
            <Link to="/" className="hover:text-charcoal transition-colors">
              Home
            </Link>
            <Link to="/register" className="hover:text-charcoal transition-colors">
              Get started
            </Link>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <motion.div variants={container} initial="hidden" animate="visible" className="space-y-12">
          <motion.div variants={item} className="max-w-3xl">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Security &amp; trust
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-navy tracking-tight">How we protect your organisation</h1>
            <p className="mt-4 text-lg text-charcoal-500">
              Safe Cloud Africa is built for regulated and safety-critical environments. This page summarises how tenant isolation, access control, and
              auditability work in plain language.
            </p>
          </motion.div>

          <motion.section variants={item} className="grid gap-6 sm:grid-cols-2">
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-navy/10">
                  <ServerIcon className="w-5 h-5 text-navy" />
                </div>
                <h2 className="text-lg font-semibold text-charcoal">Tenant isolation</h2>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">
                Each organisation has its own workspace. Data is tied to your company in the database, and row-level security helps ensure members only
                access records for organisations they belong to. You invite people explicitly; they do not see other customers&apos; data.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-teal/10">
                  <UsersIcon className="w-5 h-5 text-teal" />
                </div>
                <h2 className="text-lg font-semibold text-charcoal">Roles (RBAC)</h2>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">
                Inside a company, people have a role—such as organisation owner, admin, manager, supervisor, employee, consultant, or auditor. The app
                and database policies use these roles to limit who can view or change sensitive areas. Not every role can open every module or record.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6 sm:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <HeartIcon className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-charcoal">HR and occupational health</h2>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">
                Highly sensitive HR fields (for example banking or identity-related details stored in dedicated tables) are protected by extra database
                rules. Organisations can designate <strong className="font-medium text-charcoal">HR managers</strong> on user memberships so trusted HR
                staff can work with those records without granting everyone admin access.
              </p>
              <p className="text-sm text-charcoal-500 leading-relaxed mt-3">
                Occupational health data—such as medical fitness records—is subject to stricter access rules than general hygiene or wellness
                information. The application may also hide certain free-text fields on the client when your role does not warrant full clinical detail,
                in addition to what the database allows.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6 sm:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-charcoal/10">
                  <FileTextIcon className="w-5 h-5 text-charcoal" />
                </div>
                <h2 className="text-lg font-semibold text-charcoal">Audit logs</h2>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">
                <strong className="font-medium text-charcoal">Platform operators</strong> (super administrators) can review high-impact actions—such
                as licence changes and module toggles—in <strong className="font-medium text-charcoal">Super Admin → Audit logs</strong> after signing in
                with an authorised account.
              </p>
              <p className="text-sm text-charcoal-500 leading-relaxed mt-3">
                <strong className="font-medium text-charcoal">Inside your organisation</strong>, many workflows write entries to an activity history
                you can inspect from relevant modules—for example the Security module, General module, and Safety area—depending on how your workspace is
                set up.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6 sm:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-surface-200">
                  <LockIcon className="w-5 h-5 text-charcoal-600" />
                </div>
                <h2 className="text-lg font-semibold text-charcoal">Data location</h2>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">
                Where data is physically stored depends on your hosting and database provider and project settings. If you need a specific country or
                region for compliance, confirm the deployment and contract details with your administrator or provider rather than relying on this page
                alone.
              </p>
            </div>
          </motion.section>

          <motion.div variants={item} className="flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
            >
              Create an account <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <Link to="/" className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium border border-surface-300 text-charcoal hover:bg-white transition-colors">
              Back to home
            </Link>
          </motion.div>
        </motion.div>
      </main>

      <MarketingFooter />
    </div>
  );
}
