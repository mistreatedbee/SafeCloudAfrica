import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useAnimation, useInView } from 'framer-motion';
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
  UsersIcon,
  BuildingIcon,
  ZapIcon,
  LayersIcon,
  SettingsIcon,
  StarIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  AwardIcon,
  ClockIcon,
  ServerIcon,
  GlobeIcon,
  LockIcon,
  MessageCircleIcon,
  HelpCircleIcon,
  XIcon
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
  const controls = useAnimation();
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
  const [showScrollCta, setShowScrollCta] = useState(false);

  useEffect(() => {
    if (location.hash) scrollToHash(location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  // Show floating CTA after scrolling
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollCta(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
            <Link to="/activate" className="hover:text-charcoal transition-colors">
              Activate License
            </Link>
            <button onClick={() => scrollToHash('#testimonials')} className="hover:text-charcoal transition-colors">
              Testimonials
            </button>
            <button onClick={() => scrollToHash('#faq')} className="hover:text-charcoal transition-colors">
              FAQ
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/activate"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-charcoal hover:bg-surface-100 transition-colors"
            >
              Activate License
            </Link>
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

      {/* Floating CTA button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: showScrollCta ? 1 : 0, y: showScrollCta ? 0 : 20 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Link
          to="/register"
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-teal text-white font-semibold shadow-lg hover:bg-teal-600 transition-colors"
        >
          <SparklesIcon className="w-5 h-5" />
          Get started
        </Link>
      </motion.div>

      {/* Hero (unchanged but with subtle animation on the side panel) */}
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
                <p className="text-sm font-semibold">Aligned to ISO clauses (Annex SL)</p>
                <p className="text-sm text-navy-200 mt-1">
                  Each module maps to clauses for planning, operational control, performance evaluation, and improvement.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* NEW: Trusted By */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-white border-y border-surface-200"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-center text-sm font-semibold text-charcoal-500 uppercase tracking-wider">Trusted by leading organisations across Africa</p>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-8 items-center justify-items-center opacity-70">
            {/* Placeholder logos - replace with actual client logos */}
            <div className="h-8 w-24 bg-surface-200 rounded-lg flex items-center justify-center text-xs text-charcoal-400">MineCorp</div>
            <div className="h-8 w-24 bg-surface-200 rounded-lg flex items-center justify-center text-xs text-charcoal-400">BuildSafe</div>
            <div className="h-8 w-24 bg-surface-200 rounded-lg flex items-center justify-center text-xs text-charcoal-400">EcoEnergy</div>
            <div className="h-8 w-24 bg-surface-200 rounded-lg flex items-center justify-center text-xs text-charcoal-400">AgriHealth</div>
            <div className="h-8 w-24 bg-surface-200 rounded-lg flex items-center justify-center text-xs text-charcoal-400">TransNet</div>
          </div>
        </div>
      </motion.section>

      {/* NEW: How It Works */}
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

      {/* NEW: Stats */}
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

      {/* Modules (existing but with animations) */}
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

      {/* Features (existing but enhanced with hover) */}
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

      {/* NEW: Testimonials */}
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
            Join hundreds of organisations already using Safe Cloud Africa
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

      {/* NEW: Integrations */}
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
            { name: 'Slack', icon: MessageCircleIcon },
            { name: 'Google Drive', icon: FileTextIcon },
            { name: 'Microsoft 365', icon: CloudIcon },
            { name: 'SAP', icon: ServerIcon },
            { name: 'Power BI', icon: BarChart3Icon }
          ].map((int, i) => (
            <motion.div
              key={int.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -5 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
                <int.icon className="w-8 h-8 text-charcoal-400" />
              </div>
              <span className="text-xs font-medium text-charcoal-600">{int.name}</span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Pricing (existing but with hover) */}
      <motion.section
        id="pricing"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="bg-white border-t border-surface-200"
      >
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
            ].map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5 }}
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
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 flex flex-wrap items-center justify-between gap-4 bg-navy rounded-2xl p-6 text-white"
          >
            <div>
              <p className="font-semibold">Ready to start?</p>
              <p className="text-sm text-navy-200 mt-1">Have a license key? Activate your organisation. Otherwise register for an account.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/activate"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 transition-colors"
              >
                Activate License / Register Company <ArrowRightIcon className="w-4 h-4" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                Get started
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* NEW: FAQ */}
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
              a: 'Yes, each module maps directly to clauses in ISO 45001, 9001, and 14001. We follow Annex SL structure for easy integration.'
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

      <MarketingFooter />
    </div>
  );
}
