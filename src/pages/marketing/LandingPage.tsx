import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
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
  ChevronRightIcon,
  CheckCircleIcon,
  UsersIcon,
  ZapIcon,
  LockIcon,
  GlobeIcon,
  SmartphoneIcon,
  TrendingUpIcon,
  ClockIcon,
  DownloadIcon,
  MessageSquareIcon,
  HeadphonesIcon,
  CpuIcon
} from 'lucide-react';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

// Animation variants
const container = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.06,
      delayChildren: 0.1
    } 
  }
};

const item = { 
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.95 
  }, 
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12
    }
  } 
};

const floatAnimation = {
  y: [0, -10, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut"
  }
};

function scrollToHash(hash: string) {
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingPage() {
  const location = useLocation();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 100]);
  const y2 = useTransform(scrollY, [0, 500], [0, -50]);
  const opacity = useTransform(scrollY, [0, 200], [1, 0.8]);

  useEffect(() => {
    if (location.hash) scrollToHash(location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-white">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-300/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-300/10 rounded-full blur-3xl" />
        <motion.div 
          animate={floatAnimation}
          className="absolute top-1/3 right-1/3 w-64 h-64 bg-purple-300/5 rounded-full blur-2xl"
        />
      </div>

      {/* Top nav - Modern glass morphism */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="relative"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 shadow-lg group-hover:shadow-xl transition-shadow duration-300 flex items-center justify-center">
                <img 
                  src="/logo.png" 
                  alt="Safe Cloud Africa" 
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.innerHTML = '<CloudIcon className="w-6 h-6 text-white" />';
                  }}
                />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-teal-400 rounded-full animate-ping" />
            </motion.div>
            <div className="leading-tight">
              <p className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                Safe Cloud
              </p>
              <p className="text-xs text-teal-600 font-semibold tracking-wider">AFRICA</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            {['Modules', 'Features', 'Pricing', 'Testimonials'].map((item) => (
              <motion.button
                key={item}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => scrollToHash(`#${item.toLowerCase()}`)}
                className="relative px-3 py-2 hover:text-blue-600 transition-colors group"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300" />
              </motion.button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/login"
                className="hidden sm:inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-all duration-300 border border-blue-100"
              >
                Login
              </Link>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }} 
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-teal-500 text-white hover:shadow-lg transition-all duration-300 hover:shadow-blue-500/25 group"
              >
                Get started
                <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Modern Hero Section */}
      <section className="relative overflow-hidden pt-10 pb-20 md:pt-20">
        {/* Animated particles background */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-blue-400/20 rounded-full"
              initial={{ 
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight 
              }}
              animate={{
                y: [null, -20, 0],
                opacity: [0.2, 0.8, 0.2]
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div 
            variants={container}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div className="space-y-8">
              <motion.div 
                variants={item}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-teal-500/10 border border-blue-200/50 backdrop-blur-sm"
              >
                <SparklesIcon className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-blue-600">
                  Integrated Digital Safety Management Programme (IDSMP)
                </span>
              </motion.div>

              <motion.h1 
                variants={item}
                className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight"
              >
                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-teal-600 bg-clip-text text-transparent">
                  Total Safety
                </span>
                <br />
                <span className="text-gray-800">For the Modern</span>
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-teal-500 to-teal-600 bg-clip-text text-transparent">
                    African Workplace
                  </span>
                  <motion.div 
                    className="absolute bottom-2 left-0 w-full h-3 bg-teal-200/30 -z-10"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.5, duration: 1 }}
                  />
                </span>
              </motion.h1>

              <motion.p 
                variants={item}
                className="text-lg text-gray-600 leading-relaxed max-w-xl"
              >
                Safe Cloud Africa is a cloud-based, ISO-aligned platform that revolutionizes safety management with intelligent automation, real-time insights, and seamless collaboration for African organizations.
              </motion.p>

              <motion.div 
                variants={item}
                className="flex flex-wrap items-center gap-4"
              >
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 overflow-hidden"
                >
                  <span className="relative z-10">Start Free Trial</span>
                  <ArrowRightIcon className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
                
                <a
                  href="#modules"
                  className="group inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:border-blue-300 hover:shadow-lg transition-all duration-300"
                >
                  <PlayIcon className="w-5 h-5 text-blue-500" />
                  <span>Watch Demo</span>
                </a>
              </motion.div>

              {/* Trust badges */}
              <motion.div 
                variants={item}
                className="flex flex-wrap items-center gap-6 pt-8"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {['bg-blue-500', 'bg-teal-500', 'bg-purple-500', 'bg-green-500'].map((color, i) => (
                      <div key={i} className={`w-8 h-8 rounded-full border-2 border-white ${color}`} />
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">500+ Companies</p>
                    <p className="text-xs text-gray-500">Trust Our Platform</p>
                  </div>
                </div>

                <div className="h-8 w-px bg-gray-300" />

                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-green-500" />
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-800">ISO 45001 / 9001 / 14001</span> Compliant
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Hero visual with floating cards */}
            <motion.div 
              variants={item}
              className="relative"
            >
              <div className="relative bg-gradient-to-br from-white to-gray-50 rounded-3xl border border-gray-100 shadow-2xl p-8">
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-r from-blue-500 to-teal-400 rounded-2xl rotate-12 shadow-xl flex items-center justify-center">
                  <CloudIcon className="w-12 h-12 text-white" />
                </div>

                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-gray-800">Unified Safety Dashboard</h3>
                  <p className="text-gray-600 mt-2">Everything you need in one view</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: FileTextIcon, title: "Document Control", color: "text-blue-500", bg: "bg-blue-50" },
                    { icon: AlertTriangleIcon, title: "Incident Reports", color: "text-orange-500", bg: "bg-orange-50" },
                    { icon: GraduationCapIcon, title: "Training", color: "text-teal-500", bg: "bg-teal-50" },
                    { icon: BarChart3Icon, title: "Analytics", color: "text-purple-500", bg: "bg-purple-50" },
                  ].map((item, i) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      whileHover={{ y: -5, transition: { duration: 0.2 } }}
                      className={`${item.bg} p-4 rounded-2xl border border-gray-100 cursor-pointer group hover:shadow-lg transition-all duration-300`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${item.bg} border border-gray-200 group-hover:border-${item.color.split('-')[1]}-200`}>
                          <item.icon className={`w-5 h-5 ${item.color}`} />
                        </div>
                        <span className="font-semibold text-gray-700 text-sm">{item.title}</span>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-gray-400 ml-auto mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-100">
                  <p className="text-sm font-semibold text-blue-800">Real-time Compliance Score: 98%</p>
                  <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "98%" }}
                      transition={{ delay: 0.5, duration: 1 }}
                      className="h-full bg-gradient-to-r from-blue-500 to-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-xl">
                    <CheckCircleIcon className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">24/7 Support</p>
                    <p className="text-xs text-gray-500">Always here to help</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Enhanced Modules Section */}
      <section id="modules" className="py-20 bg-gradient-to-b from-white to-blue-50/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold mb-4">
              <ZapIcon className="w-4 h-4" />
              COMPREHENSIVE SOLUTION
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              All-in-One <span className="text-blue-600">Safety Platform</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Every tool you need for complete safety management, integrated seamlessly and designed for the African context.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Document Management System',
                icon: FileTextIcon,
                description: 'Centralized control for all safety documents',
                features: [
                  'Version control & approval workflows',
                  'Automated review date reminders',
                  'Digital signatures & audit trails',
                  'Mobile document access'
                ],
                stats: 'Reduce document retrieval by 90%',
                color: 'blue'
              },
              {
                title: 'Incident & CAPA Management',
                icon: AlertTriangleIcon,
                description: 'Complete incident lifecycle tracking',
                features: [
                  'Real-time incident reporting',
                  'Root cause analysis tools',
                  'Corrective action tracking',
                  'Automated notifications'
                ],
                stats: 'Resolve incidents 70% faster',
                color: 'orange'
              },
              {
                title: 'Training & Competency',
                icon: GraduationCapIcon,
                description: 'Comprehensive training management',
                features: [
                  'Training matrix visualization',
                  'Certificate expiry alerts',
                  'E-learning integration',
                  'Competency assessments'
                ],
                stats: '100% compliance tracking',
                color: 'teal'
              },
              {
                title: 'Audits & Inspections',
                icon: BarChart3Icon,
                description: 'Streamlined audit processes',
                features: [
                  'Customizable checklists',
                  'Mobile audit capabilities',
                  'Real-time findings tracking',
                  'Automated report generation'
                ],
                stats: 'Cut audit time by 50%',
                color: 'purple'
              },
              {
                title: 'Legal & Compliance Register',
                icon: ScaleIcon,
                description: 'Stay updated with regulations',
                features: [
                  'Automated regulation updates',
                  'Compliance obligation mapping',
                  'Evidence linking system',
                  'Compliance status dashboard'
                ],
                stats: 'Never miss a compliance deadline',
                color: 'green'
              },
              {
                title: 'Risk Management',
                icon: ShieldCheckIcon,
                description: 'Proactive risk identification',
                features: [
                  'Risk assessment templates',
                  'Risk matrix visualization',
                  'Mitigation action tracking',
                  'Risk heat maps'
                ],
                stats: 'Identify risks 30% earlier',
                color: 'red'
              }
            ].map((module, index) => (
              <motion.div
                key={module.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10, transition: { duration: 0.2 } }}
                className="group relative bg-white rounded-2xl border border-gray-100 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-teal-500" />
                
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-${module.color}-50 border border-${module.color}-100`}>
                      <module.icon className={`w-6 h-6 text-${module.color}-600`} />
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                      {module.stats}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{module.title}</h3>
                  <p className="text-gray-600 mb-4">{module.description}</p>

                  <ul className="space-y-3 mb-6">
                    {module.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 group">
                      Learn more
                      <ChevronRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="flex items-center gap-1">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-blue-400" />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Hover effect background */}
                <div className="absolute inset-0 bg-gradient-to-br from-white to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* New Features Section */}
      <section className="py-20 bg-gradient-to-b from-blue-50/20 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 text-teal-600 text-sm font-semibold mb-4">
                <SparklesIcon className="w-4 h-4" />
                INTELLIGENT FEATURES
              </div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Smart Safety <span className="text-teal-600">Automation</span>
              </h2>
              
              <div className="space-y-6">
                {[
                  {
                    icon: CpuIcon,
                    title: "AI-Powered Insights",
                    description: "Predictive analytics identify risks before they occur",
                    color: "purple"
                  },
                  {
                    icon: SmartphoneIcon,
                    title: "Mobile First Design",
                    description: "Full functionality on any device, even offline",
                    color: "blue"
                  },
                  {
                    icon: ZapIcon,
                    title: "Real-time Alerts",
                    description: "Instant notifications for critical safety events",
                    color: "orange"
                  },
                  {
                    icon: LockIcon,
                    title: "Military-Grade Security",
                    description: "Bank-level encryption and data protection",
                    color: "green"
                  }
                ].map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-4 p-4 rounded-2xl hover:bg-white hover:shadow-lg transition-all duration-300 group"
                  >
                    <div className={`p-3 rounded-xl bg-${feature.color}-50 group-hover:bg-${feature.color}-100 transition-colors`}>
                      <feature.icon className={`w-6 h-6 text-${feature.color}-600`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">{feature.title}</h4>
                      <p className="text-gray-600 text-sm">{feature.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="bg-gradient-to-br from-blue-500 to-teal-500 rounded-3xl p-8 text-white shadow-2xl">
                <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                
                <h3 className="text-2xl font-bold mb-4">See It in Action</h3>
                <p className="text-blue-100 mb-6">
                  Experience how our platform transforms safety management with real-time dashboards and automated workflows.
                </p>
                
                <div className="space-y-4">
                  {[
                    { label: "Compliance Score", value: "98%", change: "+5%" },
                    { label: "Incident Response Time", value: "2.4h", change: "-60%" },
                    { label: "Training Completion", value: "100%", change: "+30%" },
                    { label: "Audit Readiness", value: "Always", change: "✓" }
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="flex items-center justify-between p-4 bg-white/10 rounded-2xl backdrop-blur-sm"
                    >
                      <span className="font-medium">{stat.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold">{stat.value}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          stat.change.startsWith('+') || stat.change === '✓' 
                            ? 'bg-green-500/20 text-green-300' 
                            : 'bg-red-500/20 text-red-300'
                        }`}>
                          {stat.change}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="mt-8 w-full py-4 bg-white text-blue-600 font-semibold rounded-xl hover:shadow-xl transition-shadow"
                >
                  Request Personalized Demo
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gradient-to-b from-white to-blue-50/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold mb-4">
              <LockIcon className="w-4 h-4" />
              LICENSING MODEL
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Simple, Transparent <span className="text-blue-600">Licensing</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Choose the license that fits your organization. All licenses include full access to IDSMP modules and compliance features.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* 6-Month License */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -10, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/50 rounded-full -mr-16 -mt-16" />
              <div className="relative">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">6-Month License</h3>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-blue-600">R3,000</span>
                  <span className="text-gray-600 ml-2">once-off</span>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">All core modules (HR, Health, Safety, Environmental, Quality, Legal, Management)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">ISO 45001, 14001, 9001 readiness</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Incident management & reporting</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Audits & inspections</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Risk assessments</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Document & form management</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Role-based access control</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Email support</span>
                  </li>
                </ul>
                <Link
                  to="/register"
                  className="block w-full text-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Start License
                </Link>
              </div>
            </motion.div>

            {/* 12-Month License */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              whileHover={{ y: -10, transition: { duration: 0.2 } }}
              className="bg-gradient-to-br from-blue-600 to-teal-600 rounded-2xl border-2 border-blue-500 shadow-2xl p-8 relative overflow-hidden text-white"
            >
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
                  MOST POPULAR
                </span>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
              <div className="relative">
                <h3 className="text-2xl font-bold mb-2">12-Month License</h3>
                <div className="mb-6">
                  <span className="text-5xl font-bold">R5,000</span>
                  <span className="text-blue-100 ml-2">once-off</span>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Everything in 6-Month License</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Extended storage capacity</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Company branding (logo & name)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Advanced reporting & analytics</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <span>Planned feature upgrades</span>
                  </li>
                </ul>
                <Link
                  to="/register"
                  className="block w-full text-center px-6 py-3 bg-white text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Start License
                </Link>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-12 text-center"
          >
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-blue-600 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
              >
                Request Demo
              </Link>
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                <MessageSquareIcon className="w-5 h-5" />
                Contact Sales
              </button>
            </div>
            <p className="mt-6 text-sm text-gray-600">
              All licenses include compliance-driven value aligned with South African standards and ISO requirements.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Trusted by <span className="text-blue-600">African Leaders</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Join 500+ organizations across Africa that trust Safe Cloud for their safety management.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: "Sarah Johnson",
                role: "Safety Director",
                company: "Mintec Group",
                content: "Reduced our compliance time by 70%. The platform pays for itself.",
                avatarColor: "bg-blue-500"
              },
              {
                name: "David Okonkwo",
                role: "Operations Manager",
                company: "AfriBuild Ltd",
                content: "Finally, a solution built for African regulations and work environments.",
                avatarColor: "bg-teal-500"
              },
              {
                name: "Maya Patel",
                role: "Quality Assurance Head",
                company: "HealthFirst Africa",
                content: "The mobile capabilities transformed how our field teams work.",
                avatarColor: "bg-purple-500"
              }
            ].map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                whileHover={{ y: -10 }}
                className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 ${testimonial.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{testimonial.name}</h4>
                    <p className="text-sm text-gray-600">{testimonial.role}, {testimonial.company}</p>
                  </div>
                </div>
                <p className="text-gray-700 italic">"{testimonial.content}"</p>
                <div className="flex gap-1 mt-4">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-teal-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-white"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Transform Your Safety Management?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-3xl mx-auto">
              Join thousands of African companies building safer, more compliant workplaces.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to="/register"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl hover:shadow-2xl transition-all duration-300"
                >
                  Start Free 14-Day Trial
                  <ArrowRightIcon className="w-5 h-5" />
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <button className="inline-flex items-center gap-3 px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-xl hover:bg-white/10 transition-all duration-300">
                  <MessageSquareIcon className="w-5 h-5" />
                  Schedule a Demo
                </button>
              </motion.div>
            </div>

            <p className="mt-8 text-blue-100 text-sm">
              No credit card required • Full platform access • Cancel anytime
            </p>
          </motion.div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

// Add StarIcon component
function StarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  );
}

// Add PlayIcon component
function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
  );
}
