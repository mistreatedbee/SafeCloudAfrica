import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CloudIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  CodeIcon,
  SmartphoneIcon,
  SettingsIcon,
  SparklesIcon,
  MessageCircleIcon,
  BotIcon,
  WorkflowIcon,
  ShoppingCartIcon,
  BuildingIcon,
  TrendingUpIcon,
  Share2Icon,
  PenToolIcon,
  HeadphonesIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
  LayersIcon
} from 'lucide-react';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const item = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };

// Verified company details. Anything not confirmed is left as a clearly marked placeholder
// rather than invented — update these once the real values are available.
const NEXTWAVE = {
  name: 'NextWave Digital Solutions (Pty) Ltd',
  regNumber: '2026/184607/07',
  tagline: 'Transforming Ideas Into Digital Solutions',
  address: '270 Marshall Street, Johannesburg, 2001, South Africa',
  phone: '073 153 1188',
  // Not yet verified — replace with the real values when available.
  website: null as string | null,
  email: null as string | null,
  social: [] as { label: string; url: string }[]
};

const services = [
  { icon: CodeIcon, title: 'Website Development', description: 'Modern, responsive business websites and web platforms.' },
  { icon: SmartphoneIcon, title: 'Mobile App Development', description: 'Custom Android/iOS and cross-platform applications.' },
  { icon: SettingsIcon, title: 'Software Development', description: 'Custom business software designed around specific operational requirements.' },
  { icon: SparklesIcon, title: 'AI Automation', description: 'AI-powered workflows, assistants, automation and intelligent business systems.' },
  { icon: BotIcon, title: 'AI Chatbots', description: 'Intelligent customer-service and business assistants.' },
  { icon: MessageCircleIcon, title: 'WhatsApp Automation', description: 'Automated communication and business workflows through WhatsApp.' },
  { icon: WorkflowIcon, title: 'Business Process Automation', description: 'Automate repetitive business processes and reduce manual work.' },
  { icon: ShoppingCartIcon, title: 'E-Commerce', description: 'Online stores and custom commerce platforms.' },
  { icon: BuildingIcon, title: 'Custom Systems', description: 'Purpose-built platforms for organisations with specialised requirements.' },
  { icon: TrendingUpIcon, title: 'Digital Marketing', description: 'Digital marketing and online growth services.' },
  { icon: Share2Icon, title: 'Social Media Management', description: 'Social content and social-media management.' },
  { icon: PenToolIcon, title: 'Branding & Graphic Design', description: 'Professional digital branding, graphics and visual identity.' },
  { icon: HeadphonesIcon, title: 'Consulting & Technical Support', description: 'Technology consulting, system maintenance and ongoing support.' }
];

const platformBenefits = [
  { icon: UsersIcon, title: 'Direct access to the development team', description: 'Speak directly with the engineers who build and maintain SafeCloud Africa.' },
  { icon: SettingsIcon, title: 'Customisation', description: 'Adapt SafeCloud Africa to your organisation’s workflows.' },
  { icon: LayersIcon, title: 'Integrations', description: 'Connect SafeCloud with existing business systems, APIs and databases.' },
  { icon: SparklesIcon, title: 'AI capabilities', description: 'Implement AI-powered safety, compliance and reporting features.' },
  { icon: ZapIcon, title: 'New features', description: 'Request functionality tailored to how your teams actually work.' },
  { icon: HeadphonesIcon, title: 'Technical support', description: 'Ongoing maintenance, troubleshooting and platform improvements.' }
];

const customerServices = [
  { title: 'Customisation', description: 'Adapt SafeCloud Africa to your organisation’s workflows.' },
  { title: 'Integrations', description: 'Connect SafeCloud with existing business systems, APIs and databases.' },
  { title: 'AI Implementation', description: 'Implement AI-powered safety, compliance and reporting capabilities on top of SafeCloud.' },
  { title: 'Automation', description: 'Automate manual processes surrounding your SafeCloud workflows.' },
  { title: 'Technical Support', description: 'Get direct technical assistance for organisation-specific issues.' },
  { title: 'Custom Development', description: 'Commission bespoke features and modules built specifically for your organisation.' }
];

function PlaceholderNote({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      {label} not yet confirmed
    </span>
  );
}

export function NextWavePage() {
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
            <Link to="/" className="hover:text-charcoal transition-colors">Home</Link>
            <a href="#contact" className="hover:text-charcoal transition-colors">Contact NextWave</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-charcoal hover:bg-surface-100 transition-colors"
            >
              Back to SafeCloud
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
            >
              Contact NextWave <ArrowRightIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="bg-gradient-to-b from-navy via-navy to-navy-700 text-white">
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24"
          >
            <motion.div variants={item} className="flex items-center gap-3 mb-6">
              {/* No official NextWave logo asset exists in this project yet — placeholder mark used until one is supplied. */}
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20">
                <SparklesIcon className="w-7 h-7 text-teal-300" />
              </div>
              <PlaceholderNote label="Logo" />
            </motion.div>

            <motion.p variants={item} className="text-teal-300 font-semibold tracking-wide uppercase text-sm mb-3">
              {NEXTWAVE.tagline}
            </motion.p>
            <motion.h1 variants={item} className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
              NextWave Digital Solutions
            </motion.h1>
            <motion.p variants={item} className="mt-5 text-lg text-white/80 max-w-2xl leading-relaxed">
              The technology company behind SafeCloud Africa, delivering modern software, AI-powered solutions,
              automation and digital platforms for businesses.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
              >
                Contact NextWave <ArrowRightIcon className="w-4 h-4" />
              </a>
              {NEXTWAVE.website ? (
                <a
                  href={NEXTWAVE.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
                >
                  Visit Website <ExternalLinkIcon className="w-4 h-4" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white/50 cursor-not-allowed">
                  Visit Website (URL not yet confirmed)
                </span>
              )}
            </motion.div>
          </motion.div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <motion.div variants={container} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-20">
            {/* ABOUT */}
            <motion.section variants={item} className="max-w-3xl">
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                About NextWave
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Who we are</h2>
              <p className="mt-4 text-charcoal-500 leading-relaxed">
                NextWave Digital Solutions (Pty) Ltd is a South African technology company focused on creating modern
                digital solutions for businesses. We work across software development, digital transformation, AI,
                automation, custom business systems, web applications, mobile applications, integrations, e-commerce,
                and ongoing technology support.
              </p>
              <p className="mt-3 text-sm text-charcoal-400">
                Registration number: {NEXTWAVE.regNumber}
              </p>
            </motion.section>

            {/* WHAT WE DO */}
            <motion.section variants={item}>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                What we do
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight mb-8">Services</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((service) => (
                  <div key={service.title} className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-navy/10">
                        <service.icon className="w-5 h-5 text-navy" />
                      </div>
                      <h3 className="text-base font-semibold text-charcoal">{service.title}</h3>
                    </div>
                    <p className="text-sm text-charcoal-500 leading-relaxed">{service.description}</p>
                  </div>
                ))}
              </div>
            </motion.section>

            {/* SAFECLOUD CONNECTION */}
            <motion.section variants={item} className="bg-white rounded-2xl border border-surface-300 shadow-card p-8 sm:p-10">
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold mb-4">
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                The connection
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">The Technology Behind SafeCloud Africa</h2>
              <p className="mt-4 text-charcoal-500 leading-relaxed max-w-3xl">
                SafeCloud Africa is a technology platform developed by NextWave Digital Solutions (Pty) Ltd. NextWave
                provides the software engineering, platform development, technical improvements and ongoing
                technology support behind the system.
              </p>

              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {platformBenefits.map((benefit) => (
                  <div key={benefit.title} className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-teal/10 shrink-0">
                      <benefit.icon className="w-4 h-4 text-teal" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{benefit.title}</p>
                      <p className="text-sm text-charcoal-500 mt-0.5">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href="#contact"
                className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-navy text-white hover:bg-navy-700 transition-colors"
              >
                Talk to the SafeCloud Development Team <ArrowRightIcon className="w-4 h-4" />
              </a>
            </motion.section>

            {/* SERVICES FOR SAFECLOUD CUSTOMERS */}
            <motion.section variants={item}>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                For SafeCloud customers
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight mb-8">
                NextWave Services for SafeCloud Customers
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {customerServices.map((service) => (
                  <div key={service.title} className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
                    <h3 className="text-base font-semibold text-charcoal mb-2">{service.title}</h3>
                    <p className="text-sm text-charcoal-500 leading-relaxed">{service.description}</p>
                  </div>
                ))}
              </div>
            </motion.section>

            {/* CONTACT */}
            <motion.section id="contact" variants={item} className="bg-gradient-to-br from-navy to-navy-700 rounded-2xl text-white p-8 sm:p-10">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Contact NextWave</h2>
              <p className="mt-3 text-white/80 max-w-2xl">
                Reach out directly for platform customisation, integrations, or general enquiries about SafeCloud Africa.
              </p>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPinIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Address</p>
                    <p className="text-sm text-white/70 mt-0.5">{NEXTWAVE.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PhoneIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Phone</p>
                    <a href={`tel:${NEXTWAVE.phone.replace(/\s+/g, '')}`} className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                      {NEXTWAVE.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MailIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Email</p>
                    {NEXTWAVE.email ? (
                      <a href={`mailto:${NEXTWAVE.email}`} className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                        {NEXTWAVE.email}
                      </a>
                    ) : (
                      <p className="text-sm text-white/50 mt-0.5 italic">Not yet confirmed</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <GlobeIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Website</p>
                    {NEXTWAVE.website ? (
                      <a href={NEXTWAVE.website} target="_blank" rel="noreferrer" className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                        {NEXTWAVE.website}
                      </a>
                    ) : (
                      <p className="text-sm text-white/50 mt-0.5 italic">Not yet confirmed</p>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-8 text-xs text-white/50">
                Registration number: {NEXTWAVE.regNumber} · Social media links have not been confirmed yet.
              </p>
            </motion.section>
          </motion.div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
