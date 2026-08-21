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
  PenToolIcon,
  HeadphonesIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
  LayoutIcon,
  SearchIcon,
  StarIcon
} from 'lucide-react';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const item = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };

const NEXTWAVE = {
  name: 'NextWave Digital Solutions (Pty) Ltd',
  regNumber: '2026/184607/07',
  tagline: 'We Build Digital Futures',
  address: '270 Marshall Street, Johannesburg, 2001, South Africa',
  phone: '073 153 1188',
  website: 'https://www.nextwavedigitalsolutions.co.za',
  email: 'hello@nextwavedigitalsolutions.co.za',
  whatsapp: 'https://wa.me/27731531188'
};

const services = [
  {
    icon: CodeIcon,
    title: 'Starter Website',
    price: 'From R2,000',
    description: 'A polished 5-page website to establish your online presence.',
    popular: false
  },
  {
    icon: SearchIcon,
    title: 'Professional Website',
    price: 'From R3,500',
    description: 'Up to 10 pages with enhanced SEO, logo design, and Google optimisation.',
    popular: false
  },
  {
    icon: LayoutIcon,
    title: 'Premium Website',
    price: 'From R5,500',
    description: 'Unlimited pages, ecommerce integration, and 12-month hosting included.',
    popular: true
  },
  {
    icon: ZapIcon,
    title: 'Landing Page',
    price: 'R750 Special',
    description: 'High-converting single page with chatbot, booking, and contact form.',
    popular: false
  },
  {
    icon: ShoppingCartIcon,
    title: 'Ecommerce Store',
    price: 'From R4,000',
    description: 'Unlimited products, payment gateway, and full admin dashboard.',
    popular: false
  },
  {
    icon: BotIcon,
    title: 'AI Automation Suite',
    price: 'From R7,499',
    description: 'Chatbots, CRM, email automation, sales funnels, and workflow systems.',
    popular: false
  },
  {
    icon: SmartphoneIcon,
    title: 'Custom Mobile App',
    price: 'Custom quote',
    description: 'Native and cross-platform applications built to your requirements.',
    popular: false
  },
  {
    icon: WorkflowIcon,
    title: 'Business Software',
    price: 'Custom quote',
    description: 'Purpose-built software and integrations for your operations.',
    popular: false
  },
  {
    icon: PenToolIcon,
    title: 'Branding & Digital Marketing',
    price: 'Custom quote',
    description: 'Logo design, social media management, and online growth services.',
    popular: false
  }
];

const processSteps = [
  { step: '01', title: 'Consultation', description: 'We listen deeply to understand your goals, challenges, audience, and vision.' },
  { step: '02', title: 'Strategy', description: 'We architect the optimal solution — clear roadmap, technology stack, and timeline.' },
  { step: '03', title: 'Design', description: 'Precision UI/UX crafted around your brand, audience, and industry context.' },
  { step: '04', title: 'Development', description: 'Clean, scalable, production-grade code built with performance and security first.' },
  { step: '05', title: 'Testing', description: 'Rigorous QA across devices, browsers, and real-world scenarios before launch.' },
  { step: '06', title: 'Launch', description: 'Seamless deployment with full team onboarding and smooth go-live support.' },
  { step: '07', title: 'Support', description: 'Ongoing partnership to scale, maintain, and evolve your digital asset long-term.' }
];

const portfolio = [
  {
    title: 'Christian Leadership Movement',
    tag: 'Websites',
    number: '01',
    description: 'Ministry and leadership development website.'
  },
  {
    title: 'Safe Cloud Africa',
    tag: 'Websites',
    number: '02',
    description: 'Cloud security and data compliance platform.'
  },
  {
    title: 'Ashley Mash Portfolio',
    tag: 'Websites',
    number: '03',
    description: 'Creative portfolio website for a visual artist.'
  }
];

const platformBenefits = [
  { icon: UsersIcon, title: 'Direct access to the development team', description: 'Speak directly with the engineers who build and maintain SafeCloud Africa.' },
  { icon: SettingsIcon, title: 'Customisation', description: 'Adapt SafeCloud Africa to your organisation’s workflows.' },
  { icon: WorkflowIcon, title: 'Integrations', description: 'Connect SafeCloud with existing business systems, APIs and databases.' },
  { icon: SparklesIcon, title: 'AI capabilities', description: 'Implement AI-powered safety, compliance and reporting features.' },
  { icon: ZapIcon, title: 'New features', description: 'Request functionality tailored to how your teams actually work.' },
  { icon: HeadphonesIcon, title: 'Technical support', description: 'Ongoing maintenance, troubleshooting and platform improvements.' }
];

export function NextWavePage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-navy/90 backdrop-blur border-b border-white/10 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal to-teal-600">
              <CloudIcon className="w-6 h-6 text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-bold text-white">Safe Cloud</p>
              <p className="text-xs text-teal-300 font-medium">Africa</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/70">
            <a href="#services" className="hover:text-white transition-colors">Services</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#process" className="hover:text-white transition-colors">Process</a>
            <a href="#work" className="hover:text-white transition-colors">Our Work</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
            >
              Back to SafeCloud
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
            >
              Start a project <ArrowRightIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-br from-navy via-navy to-navy-800 text-white">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-80 h-80 bg-teal/20 blur-3xl rounded-full animate-pulse" />
            <div className="absolute bottom-0 -left-24 w-80 h-80 bg-teal/10 blur-3xl rounded-full animate-pulse" />
          </div>
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28"
          >
            <motion.div variants={item} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-teal-300 mb-6">
              <StarIcon className="w-3.5 h-3.5" />
              Digital Studio — Johannesburg, South Africa
            </motion.div>

            <motion.h1 variants={item} className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight max-w-3xl">
              We Build <span className="text-teal">Digital</span> Futures.
            </motion.h1>

            <motion.p variants={item} className="mt-6 text-lg sm:text-xl text-white/80 max-w-2xl leading-relaxed">
              NextWave creates premium websites, apps, AI automations, and business software for modern
              South African businesses — and is the technology company behind SafeCloud Africa.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
              >
                Start a Project <ArrowRightIcon className="w-4 h-4" />
              </a>
              <a
                href={NEXTWAVE.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
              >
                Visit Website <ExternalLinkIcon className="w-4 h-4" />
              </a>
            </motion.div>

            <motion.div variants={item} className="mt-12 grid grid-cols-3 gap-6 max-w-lg">
              <div>
                <div className="text-3xl font-bold">9+</div>
                <p className="mt-1 text-xs text-white/60">Services Offered</p>
              </div>
              <div>
                <div className="text-3xl font-bold">7</div>
                <p className="mt-1 text-xs text-white/60">Process Steps</p>
              </div>
              <div>
                <div className="text-3xl font-bold">{portfolio.length}</div>
                <p className="mt-1 text-xs text-white/60">Featured Projects</p>
              </div>
            </motion.div>
          </motion.div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <motion.div variants={container} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-20">
            {/* SERVICES & PRICING */}
            <motion.section id="services" variants={item}>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                What we do
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold text-navy tracking-tight">Our Services & Pricing</h2>
              <p className="mt-3 text-charcoal-500 max-w-2xl">
                Transparent, flat pricing for South African businesses. All prices in Rands (R) and are a
                starting point — a quote is tailored to your exact scope.
              </p>

              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((service, i) => (
                  <motion.div
                    key={service.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -5 }}
                    className={`rounded-2xl border p-6 transition-all ${
                      service.popular
                        ? 'bg-navy text-white border-navy shadow-elevated'
                        : 'bg-white border-surface-300 shadow-card hover:shadow-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-2.5 rounded-xl ${service.popular ? 'bg-white/10' : 'bg-teal/10'}`}>
                        <service.icon className={`w-6 h-6 ${service.popular ? 'text-teal-300' : 'text-teal'}`} />
                      </div>
                      {service.popular && (
                        <span className="px-2.5 py-1 rounded-full bg-teal text-white text-[11px] font-semibold">Popular</span>
                      )}
                    </div>
                    <h3 className={`mt-4 font-bold ${service.popular ? 'text-white' : 'text-charcoal'}`}>{service.title}</h3>
                    <p className={`mt-1 text-2xl font-bold ${service.popular ? 'text-teal-300' : 'text-navy'}`}>{service.price}</p>
                    <p className={`mt-2 text-sm leading-relaxed ${service.popular ? 'text-white/70' : 'text-charcoal-500'}`}>
                      {service.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* PROCESS */}
            <motion.section id="process" variants={item}>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                How we work
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold text-navy tracking-tight">The Process</h2>
              <p className="mt-3 text-charcoal-500 max-w-2xl">
                Seven transparent steps — from first conversation to long-term growth partnership.
              </p>

              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {processSteps.map((step, i) => (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-surface-300 shadow-card p-6"
                  >
                    <span className="text-3xl font-extrabold text-teal/20">{step.step}</span>
                    <h3 className="mt-2 font-bold text-charcoal">{step.title}</h3>
                    <p className="mt-1 text-sm text-charcoal-500 leading-relaxed">{step.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* PORTFOLIO */}
            <motion.section id="work" variants={item}>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal text-xs font-semibold mb-4">
                Selected work
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold text-navy tracking-tight">Featured Projects</h2>

              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {portfolio.map((project, i) => (
                  <motion.div
                    key={project.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ y: -5 }}
                    className="rounded-2xl border border-surface-300 bg-white shadow-card p-6 hover:shadow-elevated transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-extrabold text-teal/20">{project.number}</span>
                      <span className="px-2.5 py-1 rounded-full bg-surface-100 text-xs font-semibold text-charcoal-500">{project.tag}</span>
                    </div>
                    <h3 className="mt-3 font-bold text-charcoal">{project.title}</h3>
                    <p className="mt-1 text-sm text-charcoal-500">{project.description}</p>
                  </motion.div>
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

            {/* CONTACT */}
            <motion.section id="contact" variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-800 text-white p-8 sm:p-10">
              <div className="absolute -top-16 -right-16 w-64 h-64 bg-teal/20 blur-3xl rounded-full pointer-events-none" />
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Ready to build something exceptional?</h2>
              <p className="mt-3 text-white/80 max-w-2xl">
                Start a conversation with the NextWave team for websites, apps, AI automations, or SafeCloud
                Africa customisation.
              </p>

              <div className="relative mt-8 grid gap-6 sm:grid-cols-2">
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
                    <p className="text-sm font-semibold">Phone / WhatsApp</p>
                    <a href={NEXTWAVE.whatsapp} target="_blank" rel="noreferrer" className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                      {NEXTWAVE.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MailIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Email</p>
                    <a href={`mailto:${NEXTWAVE.email}`} className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                      {NEXTWAVE.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <GlobeIcon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Website</p>
                    <a href={NEXTWAVE.website} target="_blank" rel="noreferrer" className="text-sm text-white/70 hover:text-white mt-0.5 inline-block">
                      {NEXTWAVE.website.replace('https://', '')}
                    </a>
                  </div>
                </div>
              </div>

              <div className="relative mt-8 flex flex-wrap gap-3">
                <a
                  href={NEXTWAVE.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-teal text-white hover:bg-teal-600 transition-colors"
                >
                  <MessageCircleIcon className="w-4 h-4" /> Book on WhatsApp
                </a>
                <a
                  href={NEXTWAVE.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
                >
                  Visit Website <ExternalLinkIcon className="w-4 h-4" />
                </a>
              </div>

              <p className="relative mt-8 text-xs text-white/50">
                Registration number: {NEXTWAVE.regNumber}
              </p>
            </motion.section>
          </motion.div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}