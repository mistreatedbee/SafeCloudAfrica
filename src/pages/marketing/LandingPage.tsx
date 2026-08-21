import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
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
  SparklesIcon,
  CheckCircleIcon,
  BuildingIcon,
  ZapIcon,
  SettingsIcon,
  StarIcon,
  ChevronDownIcon,
  AwardIcon,
  ServerIcon,
  MessageCircleIcon
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

// Counter component for stats
function Counter({ from = 0, to, duration = 2 }: { from?: number; to: number; duration?: number }) {
  const [count, setCount] = useState(from);
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) {
      let startTime: number;
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
        setCount(Math.floor(from + (to - from) * progress));
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [inView, from, to, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

export function LandingPage() {
  const location = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isoDetailOpen, setIsoDetailOpen] = useState(false);

  useEffect(() => {
    if (location.hash) scrollToHash(location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Top nav (unchanged) */}
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
            <button onClick={() => scrollToHash('#testimonials')} className="hover:text-charcoal transition-colors">
              Testimonials
            </button>
            <button onClick={() => scrollToHash('#case-studies')} className="hover:text-charcoal transition-colors">
              Case studies
            </button>
            <button onClick={() => scrollToHash('#iso-alignment')} className="hover:text-charcoal transition-colors">
              ISO
            </button>
            <button onClick={() => scrollToHash('#faq')} className="hover:text-charcoal transition-colors">
              FAQ
            </button>
            <Link to="/security" className="hover:text-charcoal transition-colors">
              Security
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

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-teal/15 blur-3xl rounded-full animate-pulse" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-navy/10 blur-3xl rounded-full animate-pulse" />
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
                1 system. <span className="text-teal">Total safety control.</span>
              </motion.h1>

              <motion.p variants={item} className="mt-4 text-base text-charcoal-500 max-w-xl">
                Safe Cloud Africa is a cloud-based platform built to manage documents, tasks, incidents, training, audits,
                risks, approvals, and compliance scoring—end to end.
              </motion.p>

              <motion.div variants={item} className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  to="/register"
                  className="inline-flex w-fit items-center gap-2 px-5 py-3 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 transition-colors"
                >
                  Get started <ArrowRightIcon className="w-4 h-4" />
                </Link>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <button
                    type="button"
                    onClick={() => scrollToHash('#modules')}
                    className="text-teal font-medium hover:underline underline-offset-2"
                  >
                    View modules
                  </button>
                  <span className="text-charcoal-300 hidden sm:inline" aria-hidden>
                    ·
                  </span>
                  <Link to="/login" className="text-charcoal-500 hover:text-teal transition-colors">
                    Log in
                  </Link>
                </div>
              </motion.div>

              <motion.div variants={item} className="mt-7 flex items-start gap-3 text-sm text-charcoal-500">
                <ShieldCheckIcon className="w-5 h-5 text-success mt-0.5 shrink-0" />
                <p>
                  Designed for <span className="font-semibold text-charcoal">auditability</span>, evidence storage, and long-term scalability.
                </p>
              </motion.div>
            </div>

            <motion.div variants={item} className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 hover:shadow-xl transition-shadow">
              <p className="text-sm font-semibold text-charcoal">What the platform helps you do</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 hover:border-teal/30 transition-colors">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <FileTextIcon className="w-5 h-5 text-teal" /> Document control
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Versions, approvals, review dates, audit trail.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 hover:border-teal/30 transition-colors">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <ClipboardCheckIcon className="w-5 h-5 text-teal" /> Tasks & time
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Plan, assign, track time and completion.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 hover:border-teal/30 transition-colors">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <AlertTriangleIcon className="w-5 h-5 text-warning" /> Incidents & CAPA
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Report, investigate, corrective actions.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 hover:border-teal/30 transition-colors">
                  <div className="flex items-center gap-2 font-semibold text-charcoal">
                    <GraduationCapIcon className="w-5 h-5 text-teal" /> Training & competency
                  </div>
                  <p className="mt-1 text-sm text-charcoal-500">Matrix, expiry reminders, certificates.</p>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-xl bg-navy text-white">
                <p className="text-sm font-semibold">Keep work traceable</p>
                <p className="text-sm text-navy-200 mt-1">
                  Approvals, versions, and activity history help your team show what happened—and when—without digging through inboxes.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trusted By - Enhanced with glow */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-white border-y border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-center text-sm font-semibold text-charcoal-500 uppercase tracking-wider">
            Trusted by teams across Africa
          </p>
          <p className="text-center text-xs text-charcoal-400 mt-2 max-w-xl mx-auto">
            Logos shown are illustrative placeholders until partner marks are approved for display.
          </p>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-8 items-center justify-items-center">
            {['MineCorp', 'BuildSafe', 'EcoEnergy', 'AgriHealth', 'TransNet'].map((name) => (
              <motion.div
                key={name}
                whileHover={{ scale: 1.1 }}
                className="relative group cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-blue-500 rounded-lg opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300" />
                <div className="relative h-12 w-28 bg-gradient-to-br from-surface-100 to-surface-200 rounded-lg flex items-center justify-center text-sm font-medium text-charcoal-700 border border-surface-300 group-hover:border-teal-400 group-hover:text-teal-700 transition-all duration-300 shadow-sm">
                  {name}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ISO alignment — one line + optional detail */}
      <motion.section
        id="iso-alignment"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="bg-surface-50 border-b border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3 min-w-0">
                <AwardIcon className="w-6 h-6 text-teal shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-navy">Built to align with international ISO standards.</p>
                  <p className="text-sm text-charcoal-500 mt-1">
                    We structure workflows so you can run your programme in a clear, reviewable way—not a pile of spreadsheets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsoDetailOpen((o) => !o)}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-teal hover:text-teal-700 self-start"
              >
                {isoDetailOpen ? 'Hide detail' : 'What this means'}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isoDetailOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <motion.div
              initial={false}
              animate={{ height: isoDetailOpen ? 'auto' : 0 }}
              className="overflow-hidden"
            >
              <ul className="mt-4 pt-4 border-t border-surface-200 space-y-2 text-sm text-charcoal-500 list-disc pl-5">
                <li>Document and record key activities so evidence is easy to find when you need it.</li>
                <li>Support regular checks and improvements with tasks, audits, and incident follow-up in one place.</li>
                <li>Help teams stay competent with training records and reminders—without manual chasing.</li>
              </ul>
              <p className="mt-3 text-xs text-charcoal-400">
                Certification is issued by accredited bodies; your organisation remains responsible for its management system.
              </p>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* How It Works (unchanged) */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      >
        <h2 className="text-2xl font-bold text-navy text-center">How Safe Cloud Africa works</h2>
        <p className="text-sm text-charcoal-500 mt-2 text-center max-w-2xl mx-auto">
          From setup to full compliance management in three simple steps
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: SettingsIcon, title: '1. Configure', desc: 'Set up your organisation, users, and modules. Customise to match your processes.' },
            { icon: ZapIcon, title: '2. Operate', desc: 'Execute daily tasks: document control, incident reporting, training assignments.' },
            { icon: AwardIcon, title: '3. Analyse & Improve', desc: 'Track KPIs, run audits, and continuously improve with data-driven insights.' }
          ].map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -5 }}
              className="text-center p-6 rounded-2xl bg-white border border-surface-200 shadow-sm hover:shadow-md transition-all"
            >
              <div className="inline-flex p-3 rounded-xl bg-teal-50 text-teal">
                <step.icon className="w-6 h-6" />
              </div>
              <h3 className="mt-4 font-semibold text-charcoal">{step.title}</h3>
              <p className="mt-2 text-sm text-charcoal-500">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Stats (unchanged) */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-gradient-to-br from-navy to-navy-800 text-white"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-4xl font-bold">
                <Counter from={0} to={150} duration={2} />+
              </div>
              <p className="mt-2 text-navy-200 text-sm">Active organisations</p>
            </div>
            <div>
              <div className="text-4xl font-bold">
                <Counter from={0} to={2500} duration={2} />+
              </div>
              <p className="mt-2 text-navy-200 text-sm">Users trained</p>
            </div>
            <div>
              <div className="text-4xl font-bold">
                <Counter from={0} to={5000} duration={2} />+
              </div>
              <p className="mt-2 text-navy-200 text-sm">Incidents logged</p>
            </div>
            <div>
              <div className="text-4xl font-bold">
                <Counter from={0} to={99.9} duration={2} />%
              </div>
              <p className="mt-2 text-navy-200 text-sm">Uptime</p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Modules (unchanged) */}
      <motion.section
        id="modules"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-white border-t border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-navy">Core modules</h2>
              <p className="mt-3 text-lg font-semibold text-charcoal">
                Built around <span className="text-teal">Quality, Safety, Health, Environment, Legal, HR, and General</span>—plus supporting modules for evidence and control.
              </p>
              <p className="mt-2 text-sm text-charcoal-500">
                Every module works together so your programme stays connected and fully controlled in one place.
              </p>
            </div>
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-normal text-charcoal-500 hover:text-teal transition-colors"
            >
              Log in <ArrowRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: 'Documents (DMS)', icon: FileTextIcon, desc: 'Policies, procedures, registers, version control.' },
              { title: 'Tasks & Time', icon: ClipboardCheckIcon, desc: 'Inspections, toolbox talks, time tracking.' },
              { title: 'Incidents & CAPA', icon: AlertTriangleIcon, desc: 'Near misses, investigations, corrective actions.' },
              { title: 'Training & Competency', icon: GraduationCapIcon, desc: 'Training matrix, expiry alerts, certificates.' },
              { title: 'Audits & Inspections', icon: BarChart3Icon, desc: 'Checklists, findings, evidence uploads.' },
              { title: 'Legal Register', icon: ScaleIcon, desc: 'Compliance obligations linked to evidence and actions.' },
              { title: 'Environmental', icon: CloudIcon, desc: 'EIA, waste, water, air, risk & opportunity tracking.' },
              { title: 'Health', icon: ShieldCheckIcon, desc: 'Medical surveillance, hygiene, wellness programmes.' },
              { title: 'Human Resources', icon: BuildingIcon, desc: 'Employees, leave, performance, training records.' },
              { title: 'Security', icon: SettingsIcon, desc: 'SSSA/SSA processes and workplace security controls.' },
              { title: 'Hazardous Chemicals', icon: AlertTriangleIcon, desc: 'SDS management and hazardous chemical registers.' },
              { title: 'Risk Assessments', icon: AwardIcon, desc: 'HIRA, risk registers, and assessment workflows.' }
            ].map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.02 }}
                className="bg-surface-50 border border-surface-200 rounded-2xl p-5 hover:border-teal/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-surface-200">
                    <m.icon className="w-5 h-5 text-teal" />
                  </div>
                  <p className="font-semibold text-charcoal">{m.title}</p>
                </div>
                <p className="mt-2 text-sm text-charcoal-500">{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Features (unchanged) */}
      <motion.section
        id="features"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      >
        <h2 className="text-2xl font-bold text-navy">Built for South African organisations</h2>
        <p className="text-sm text-charcoal-500 mt-2 max-w-3xl">
          African-first, cloud-based, and designed for real-world operational control—without the admin headache.
        </p>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 hover:shadow-xl transition-all"
          >
            <p className="font-semibold text-charcoal">Organisation & user management</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Role-based access control, user onboarding, and organisation settings built for SA SMEs and growing teams.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Secure by design</span>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 hover:shadow-xl transition-all"
          >
            <p className="font-semibold text-charcoal">Secure cloud storage + audit trails</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Store documents and evidence with activity tracking, approvals, and audit logs for defensible compliance.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Audit-ready</span>
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Privacy-aware</span>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 hover:shadow-xl transition-all"
          >
            <p className="font-semibold text-charcoal">Scalable infrastructure</p>
            <p className="mt-2 text-sm text-charcoal-500">
              Built to grow from a small business to multi-site operations with reliable performance and structured data.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-charcoal-500">
              <span className="px-2 py-1 rounded-full bg-teal-50 border border-teal/20 text-teal">Planned Upgrade</span>
              <span className="px-2 py-1 rounded-full bg-surface-100 border border-surface-200">Advanced analytics</span>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Testimonials (unchanged) */}
      <motion.section
        id="testimonials"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-surface-50 border-y border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-2xl font-bold text-navy text-center">What our clients say</h2>
          <p className="text-sm text-charcoal-500 mt-2 text-center max-w-2xl mx-auto">
            Representative feedback—replace with verified quotes when available.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Thabo M.',
                role: 'Safety Manager, MineCorp',
                content: 'Safe Cloud Africa transformed our safety processes. We now have real-time visibility into incidents and training compliance.',
                rating: 5
              },
              {
                name: 'Linda N.',
                role: 'Operations Director, BuildSafe',
                content: 'The ISO alignment is a game-changer. Audits used to take weeks—now we generate reports in minutes.',
                rating: 5
              },
              {
                name: 'Sipho D.',
                role: 'CEO, AgriHealth',
                content: 'Affordable, easy to use, and the support team is fantastic. Highly recommended for any growing business.',
                rating: 5
              }
            ].map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className="bg-white rounded-2xl border border-surface-200 p-6 shadow-sm"
              >
                <div className="flex gap-1 text-yellow-400">
                  {[...Array(t.rating)].map((_, i) => (
                    <StarIcon key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="mt-3 text-sm text-charcoal-600 italic">"{t.content}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-300 flex items-center justify-center text-xs font-bold text-white">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">{t.name}</p>
                    <p className="text-xs text-charcoal-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Case study teasers */}
      <motion.section
        id="case-studies"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      >
        <h2 className="text-2xl font-bold text-navy text-center">Customer stories</h2>
        <p className="text-sm text-charcoal-500 mt-2 text-center max-w-2xl mx-auto">
          Short case teasers—full stories and metrics coming soon.
        </p>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              org: 'MineCorp',
              sector: 'Mining & resources',
              outcome: 'Unified incident reporting and training records so sites could prep for audits from one dashboard.'
            },
            {
              org: 'BuildSafe',
              sector: 'Construction',
              outcome: 'Fewer missed toolbox talks and clearer accountability across subcontractors and site leads.'
            },
            {
              org: 'AgriHealth',
              sector: 'Agri-processing',
              outcome: 'Competency tracking and document control that scaled as they added shifts and seasonal workers.'
            }
          ].map((cs, i) => (
            <motion.div
              key={cs.org}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm flex flex-col"
            >
              <div className="flex items-center gap-2 text-charcoal-500">
                <BuildingIcon className="w-5 h-5 text-teal shrink-0" />
                <span className="text-xs font-medium uppercase tracking-wide">{cs.sector}</span>
              </div>
              <p className="mt-3 font-semibold text-charcoal">{cs.org}</p>
              <p className="mt-2 text-sm text-charcoal-500 flex-1">{cs.outcome}</p>
              <a
                href={`mailto:support@safecloud.africa?subject=${encodeURIComponent(`Case study: ${cs.org}`)}`}
                className="mt-4 inline-flex text-sm font-medium text-teal hover:underline underline-offset-2 w-fit"
              >
                Read story
              </a>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Integrations - Enhanced with glow */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      >
        <h2 className="text-2xl font-bold text-navy text-center">Integrate with your existing tools</h2>
        <p className="text-sm text-charcoal-500 mt-2 text-center max-w-2xl mx-auto">
          Connect Safe Cloud Africa with the platforms you already use (coming soon)
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-8">
          {[
            { name: 'Slack', icon: MessageCircleIcon, color: 'from-purple-400 to-pink-500' },
            { name: 'Google Drive', icon: FileTextIcon, color: 'from-green-400 to-emerald-500' },
            { name: 'Microsoft 365', icon: CloudIcon, color: 'from-blue-400 to-indigo-500' },
            { name: 'SAP', icon: ServerIcon, color: 'from-yellow-400 to-orange-500' },
            { name: 'Power BI', icon: BarChart3Icon, color: 'from-amber-400 to-yellow-600' }
          ].map((int, i) => (
            <motion.div
              key={int.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -5, scale: 1.1 }}
              className="relative group cursor-pointer"
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${int.color} rounded-2xl opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300`} />
              <div className="relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-surface-200 shadow-sm group-hover:shadow-lg group-hover:border-transparent transition-all duration-300">
                <int.icon className="w-8 h-8 text-charcoal-600 group-hover:text-charcoal-900" />
                <span className="text-xs font-medium text-charcoal-600 group-hover:text-charcoal-900">{int.name}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Pricing - Updated with new tiers */}
      <motion.section
        id="pricing"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-white border-t border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-2xl font-bold text-navy">Pricing</h2>
          <p className="text-sm text-charcoal-500 mt-2 max-w-3xl">
            Simple, transparent licensing for South African businesses. All prices in South African Rands (R) per month.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Starter</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">1–15 employees</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">R650<span className="text-sm font-normal text-charcoal-500">/mo</span></p>
              <p className="mt-1 text-xs text-charcoal-500">Ideal for small businesses and growing teams.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Core platform access</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Document and task workflows</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Email support</li>
              </ul>
              <Link
                to="/register"
                className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Choose Starter plan
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Professional</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">16–40 employees</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">R950<span className="text-sm font-normal text-charcoal-500">/mo</span></p>
              <p className="mt-1 text-xs text-charcoal-500">Built for growing operations with more oversight needs.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />All core modules</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Advanced reporting</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Priority support</li>
              </ul>
              <Link
                to="/register"
                className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Choose Professional plan
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border-2 border-teal shadow-card p-6 relative"
            >
              <div className="absolute top-0 right-0 bg-teal text-white px-3 py-1 rounded-bl-lg rounded-tr-lg text-xs font-semibold">Most popular</div>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Business</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">41–100 employees</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">R1,799<span className="text-sm font-normal text-charcoal-500">/mo</span></p>
              <p className="mt-1 text-xs text-charcoal-500">Designed for scaling organisations with broader oversight needs.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Expanded operational controls</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Cross-team compliance visibility</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Enhanced support</li>
              </ul>
              <Link
                to="/register"
                className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Choose Business plan
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Enterprise</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">101–250 employees</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">R3,200<span className="text-sm font-normal text-charcoal-500">/mo</span></p>
              <p className="mt-1 text-xs text-charcoal-500">For large organisations that need deeper safety oversight.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Full platform access</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Dedicated support coverage</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Free SHEQ Support</li>
              </ul>
              <Link
                to="/register"
                className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Choose Enterprise plan
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Corporate</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">251+ employees</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">R4,200<span className="text-sm font-normal text-charcoal-500">/mo</span></p>
              <p className="mt-1 text-xs text-charcoal-500">For large organisations that need broader corporate oversight.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Full platform access</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Dedicated support coverage</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Free SHEQ Support</li>
              </ul>
              <Link
                to="/register"
                className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Choose Corporate plan
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
              whileHover={{ y: -5 }}
              className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-charcoal">Custom</p>
                <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">Tailored scope</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-navy">Quote by request</p>
              <p className="mt-1 text-xs text-charcoal-500">Bespoke configuration for organisations with unique requirements.</p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Tailored modules</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Custom onboarding</li>
                <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Dedicated support</li>
              </ul>
              <a
                href="mailto:support@safecloud.africa?subject=Custom%20quote%20request"
                className="mt-4 inline-flex text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Request a quote
              </a>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 p-6 rounded-2xl bg-surface-100 border border-surface-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-charcoal">SHEQ Support (consulting)</h3>
                <p className="text-sm text-charcoal-500">Risk assessment, investigations, audits, mentorship and more.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-2xl font-bold text-navy">R350<span className="text-sm font-normal text-charcoal-500">/hr</span></span>
                <a
                  href="mailto:support@safecloud.africa?subject=SHEQ%20Support%20inquiry"
                  className="text-sm font-medium text-teal hover:underline underline-offset-2"
                >
                  Request SHEQ Support
                </a>
              </div>
            </div>
          </motion.div>

          {/* HR Pricing */}
          <motion.div
            id="hr-pricing"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 pt-10 border-t border-surface-200"
          >
            <h2 className="text-2xl font-bold text-navy">HR module pricing</h2>
            <p className="text-sm text-charcoal-500 mt-2 max-w-3xl">
              Choose between buying the HR module on its own, or — better yet — getting it free as part of the major system.
            </p>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
                className="bg-surface-50 rounded-2xl border border-surface-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-charcoal">HR module only</p>
                  <span className="px-2 py-1 rounded-full bg-surface-200 text-xs font-semibold text-charcoal-600">Standalone</span>
                </div>
                <p className="mt-2 text-3xl font-bold text-navy">R30<span className="text-sm font-normal text-charcoal-500">/employee/mo</span></p>
                <p className="mt-1 text-xs text-charcoal-500">For teams that only need HR functionality.</p>
                <ul className="mt-4 space-y-2 text-sm text-charcoal-500">
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Employees & profiles</li>
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Leave & attendance</li>
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-success mt-0.5" />Training & performance</li>
                </ul>
                <Link
                  to="/register"
                  className="mt-4 inline-block text-sm font-medium text-teal hover:underline underline-offset-2"
                >
                  Get HR module
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
                className="bg-navy rounded-2xl border-2 border-teal shadow-card p-6 text-white relative"
              >
                <div className="absolute top-0 right-0 bg-teal text-white px-3 py-1 rounded-bl-lg rounded-tr-lg text-xs font-semibold">Included free</div>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-white">HR inside the major system</p>
                  <span className="px-2 py-1 rounded-full bg-navy-700 text-xs font-semibold text-white">Recommended option</span>
                </div>
                <p className="mt-2 text-3xl font-bold text-teal">Included<span className="text-sm font-normal text-navy-200"> — free</span></p>
                <p className="mt-1 text-xs text-navy-200">
                  Already included in the major system pricing, so it is effectively free within your chosen plan:
                </p>
                <ul className="mt-4 space-y-2 text-sm text-navy-200">
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-teal mt-0.5" />Starter (1–35) <span className="ml-auto font-semibold text-white">R450/mo</span></li>
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-teal mt-0.5" />Professional (36–100) <span className="ml-auto font-semibold text-white">R650/mo</span></li>
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-teal mt-0.5" />Business (100–200) <span className="ml-auto font-semibold text-white">R899/mo</span></li>
                  <li className="flex items-start gap-2"><CheckCircleIcon className="w-4 h-4 text-teal mt-0.5" />Enterprise (250+) <span className="ml-auto font-semibold text-white">R1,599/mo</span></li>
                </ul>
                <Link
                  to="/register"
                  className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 transition-colors"
                >
                  Get started <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 flex flex-wrap items-center justify-between gap-4 bg-navy rounded-2xl p-6 text-white"
          >
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
          </motion.div>
        </div>
      </motion.section>

      {/* FAQ (unchanged) */}
      <motion.section
        id="faq"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      >
        <h2 className="text-2xl font-bold text-navy text-center">Frequently asked questions</h2>
        <p className="text-sm text-charcoal-500 mt-2 text-center max-w-2xl mx-auto">
          Everything you need to know about Safe Cloud Africa
        </p>

        <div className="mt-10 max-w-3xl mx-auto">
          {[
            {
              q: 'Is Safe Cloud Africa really aligned with ISO standards?',
              a: 'Yes. The platform is built so common ISO management-system practices—clear records, reviews, and improvement loops—are easier to run day to day. See the ISO section above for a plain-language overview; certification is always handled by an accredited body.'
            },
            {
              q: 'Can I try the platform before purchasing?',
              a: 'Absolutely! You can register for free and explore the core modules. No credit card required.'
            },
            {
              q: 'Is my data secure?',
              a: 'We use enterprise-grade encryption, regular backups, and strict access controls. All data is hosted in South Africa.'
            },
            {
              q: 'Do you offer training and support?',
              a: 'Yes, we provide onboarding assistance, user guides, and email support. Enterprise plans include dedicated training.'
            }
          ].map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="border-b border-surface-200 last:border-0"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full py-5 flex items-center justify-between text-left"
              >
                <span className="font-semibold text-charcoal">{faq.q}</span>
                <ChevronDownIcon
                  className={`w-5 h-5 text-charcoal-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              <motion.div
                initial={false}
                animate={{ height: openFaq === i ? 'auto' : 0 }}
                className="overflow-hidden"
              >
                <p className="pb-5 text-sm text-charcoal-500">{faq.a}</p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* NextWave teaser */}
      <section className="relative overflow-hidden border-t border-surface-200 bg-navy text-white">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-teal/25 blur-3xl rounded-full animate-pulse pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-teal/10 blur-3xl rounded-full animate-pulse pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-xs font-bold text-teal-300 uppercase tracking-widest">
                <SparklesIcon className="w-4 h-4" /> Built by NextWave Digital Solutions
              </p>
              <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold leading-tight">
                We build digital futures.
              </h2>
              <p className="mt-3 text-white/75 max-w-xl">
                Safe Cloud Africa is developed and supported by NextWave Digital Solutions (Pty) Ltd — a South African
                technology company behind the software, AI, websites, apps, and ongoing platform improvements.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-6 max-w-md">
                <div>
                  <div className="text-2xl font-bold text-teal-300">Websites</div>
                  <p className="mt-0.5 text-xs text-white/60">From R2,000</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-teal-300">AI</div>
                  <p className="mt-0.5 text-xs text-white/60">Automation</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-teal-300">Apps</div>
                  <p className="mt-0.5 text-xs text-white/60">Custom built</p>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <Link
                to="/nextwave"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold bg-teal text-white hover:bg-teal-600 hover:shadow-elevated transition-all whitespace-nowrap"
              >
                Explore NextWave <ArrowRightIcon className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
