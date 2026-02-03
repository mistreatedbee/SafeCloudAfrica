import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  HelpCircleIcon,
  MessageSquareIcon,
  PhoneIcon,
  MailIcon,
  FileTextIcon,
  SendIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { createSupportTicket } from '../api/services/supportService';

type TicketCategory = 'bug' | 'access' | 'billing' | 'feature-request' | 'other';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function HelpSupportPage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    category: 'bug' as TicketCategory,
    subject: '',
    description: '',
    attachmentUrl: ''
  });

  const categories: { value: TicketCategory; label: string; icon: React.ReactNode }[] = [
    { value: 'bug', label: 'Bug Report', icon: <AlertCircleIcon className="w-4 h-4" /> },
    { value: 'access', label: 'Access Issue', icon: <PhoneIcon className="w-4 h-4" /> },
    { value: 'billing', label: 'Billing', icon: <MailIcon className="w-4 h-4" /> },
    { value: 'feature-request', label: 'Feature Request', icon: <FileTextIcon className="w-4 h-4" /> },
    { value: 'other', label: 'Other', icon: <HelpCircleIcon className="w-4 h-4" /> }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.description.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);

      await createSupportTicket({
        company_id: activeCompanyId,
        user_id: user?.id,
        user_email: user?.email,
        category: formData.category,
        subject: formData.subject,
        description: formData.description
      });

      setMessage({
        type: 'success',
        text: 'Support ticket created successfully. Our team will respond within 24 hours.'
      });

      // Reset form
      setFormData({
        category: 'bug',
        subject: '',
        description: '',
        attachmentUrl: ''
      });
    } catch (err) {
      console.error('Failed to create support ticket:', err);
      setMessage({
        type: 'error',
        text: 'Failed to create support ticket. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Help & Support">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <motion.div variants={itemVariants} className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-8 text-white">
          <div className="flex items-start gap-4">
            <HelpCircleIcon className="w-8 h-8 flex-shrink-0" />
            <div>
              <h1 className="text-3xl font-bold">Help & Support</h1>
              <p className="mt-2 text-navy-200">
                We're here to help! Submit a ticket and our support team will get back to you.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-xl border border-surface-300 shadow-card p-6">
            <h2 className="text-xl font-semibold text-charcoal mb-6">Create a Support Ticket</h2>

            {message && (
              <div
                className={`mb-6 p-4 rounded-lg border flex items-center gap-3 ${
                  message.type === 'success'
                    ? 'bg-success-50 border-success-200 text-success'
                    : 'bg-critical-50 border-critical-200 text-critical'
                }`}>
                {message.type === 'success' ? (
                  <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <AlertCircleIcon className="w-5 h-5 flex-shrink-0" />
                )}
                <span className="text-sm font-medium">{message.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-3">
                  Issue Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category: cat.value }))}
                      className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                        formData.category === cat.value
                          ? 'border-teal bg-teal-50'
                          : 'border-surface-300 hover:border-surface-400'
                      }`}>
                      <span className={formData.category === cat.value ? 'text-teal' : 'text-charcoal-400'}>
                        {cat.icon}
                      </span>
                      <span className="text-xs font-medium text-charcoal">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Brief description of your issue"
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Provide detailed information about your issue. Include steps to reproduce if applicable."
                  rows={6}
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all resize-none"
                  required
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 pt-4 border-t border-surface-200">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting && <LoaderIcon className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                  {!submitting && <SendIcon className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </motion.div>

          {/* Sidebar: Resources & Contact */}
          <motion.div variants={itemVariants} className="space-y-6">
            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
              <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
                <FileTextIcon className="w-5 h-5 text-teal" />
                Resources
              </h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#"
                    className="text-sm text-teal hover:text-teal-700 font-medium transition-colors">
                    Documentation →
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-teal hover:text-teal-700 font-medium transition-colors">
                    FAQ & Guides →
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-teal hover:text-teal-700 font-medium transition-colors">
                    Video Tutorials →
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-teal hover:text-teal-700 font-medium transition-colors">
                    System Status →
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
              <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
                <MessageSquareIcon className="w-5 h-5 text-navy" />
                Contact Info
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-charcoal-500">Email</p>
                  <a
                    href="mailto:support@safecloudafrica.com"
                    className="text-sm font-medium text-teal hover:text-teal-700 transition-colors">
                    support@safecloudafrica.com
                  </a>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500">Response Time</p>
                  <p className="text-sm font-medium text-charcoal">
                    Within 24 hours
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500">Hours</p>
                  <p className="text-sm font-medium text-charcoal">
                    Monday - Friday<br />
                    08:00 - 17:00 SAST
                  </p>
                </div>
              </div>
            </div>

            {/* Urgent Support */}
            <div className="bg-warning-50 rounded-xl border border-warning-200 shadow-card p-6">
              <h3 className="font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertCircleIcon className="w-5 h-5" />
                Urgent Issue?
              </h3>
              <p className="text-sm text-warning mb-4">
                For critical issues, please call our hotline.
              </p>
              <a
                href="tel:+27-11-234-5678"
                className="flex items-center gap-2 px-4 py-2 bg-warning text-white rounded-lg font-medium hover:bg-warning-700 transition-colors w-full justify-center">
                <PhoneIcon className="w-4 h-4" />
                Call Now
              </a>
            </div>
          </motion.div>
        </div>

      </motion.div>
    </Layout>
  );
}
