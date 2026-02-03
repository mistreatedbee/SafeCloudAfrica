import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  UserIcon,
  MailIcon,
  PhoneIcon,
  BuildingIcon,
  ShieldIcon,
  SaveIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { getUserProfile, updateUserProfile } from '../api/services/profilesService';

type Profile = {
  id: string;
  user_id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  site: string | null;
};

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

export function ProfilePage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    department: '',
    site: ''
  });

  useEffect(() => {
    async function loadProfile() {
      if (!activeCompanyId || !user?.id) return;

      try {
        setLoading(true);
        const data = await getUserProfile(activeCompanyId, user.id);
        if (data) {
          setProfile(data);
          setFormData({
            fullName: data.full_name || '',
            phone: data.phone || '',
            department: data.department || '',
            site: data.site || ''
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        setMessage({ type: 'error', text: 'Failed to load profile' });
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [activeCompanyId, user?.id]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;

    try {
      setSaving(true);
      setMessage(null);

      await updateUserProfile(activeCompanyId, user.id, {
        full_name: formData.fullName,
        phone: formData.phone,
        department: formData.department,
        site: formData.site
      });

      setMessage({ type: 'success', text: 'Profile updated successfully' });

      // Reload profile
      const updated = await getUserProfile(activeCompanyId, user.id);
      if (updated) {
        setProfile(updated);
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
      setMessage({ type: 'error', text: 'Failed to save profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="My Profile">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-navy to-navy-700 text-white flex items-center justify-center text-3xl font-bold">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-charcoal">
                {formData.fullName || user?.email || 'User Profile'}
              </h1>
              <p className="text-charcoal-500 mt-1">{user?.email}</p>
              <div className="mt-3 flex gap-4">
                <span className="inline-block px-3 py-1 bg-navy-50 text-navy text-sm font-medium rounded-lg">
                  {activeRole ? activeRole.charAt(0).toUpperCase() + activeRole.slice(1) : 'Member'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Messages */}
        {message && (
          <motion.div
            variants={itemVariants}
            className={`p-4 rounded-lg border flex items-center gap-3 ${
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
          </motion.div>
        )}

        {/* Personal Information */}
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-6 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-teal" />
            Personal Information
          </h2>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
              />
            </div>

            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Email Address
              </label>
              <div className="flex items-center gap-2 px-4 py-2.5 border border-surface-300 rounded-lg bg-surface-50 text-charcoal-500">
                <MailIcon className="w-4 h-4" />
                <span>{user?.email}</span>
              </div>
              <p className="text-xs text-charcoal-400 mt-2">
                Email addresses cannot be changed. Contact support to update.
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Phone Number
              </label>
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-charcoal-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+27 (0)11 234 5678"
                  className="flex-1 px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="border-t border-surface-200 pt-5" />

            {/* Department & Site */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                  placeholder="e.g. Safety, Operations"
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Site / Location
                </label>
                <input
                  type="text"
                  value={formData.site}
                  onChange={(e) => handleChange('site', e.target.value)}
                  placeholder="e.g. Head Office, Johannesburg"
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
              <button
                type="submit"
                disabled={saving || loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {saving && <LoaderIcon className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </motion.div>

        {/* Organization Information */}
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-6 flex items-center gap-2">
            <BuildingIcon className="w-5 h-5 text-navy" />
            Organization
          </h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-charcoal-500">Company</p>
              <p className="text-charcoal font-medium mt-1">
                {/* TODO: Display company name from context */}
                Your Company
              </p>
            </div>

            <div>
              <p className="text-sm text-charcoal-500">Role</p>
              <p className="text-charcoal font-medium mt-1 inline-block px-3 py-1 bg-navy-50 text-navy rounded-lg">
                {activeRole ? activeRole.charAt(0).toUpperCase() + activeRole.slice(1) : 'Member'}
              </p>
            </div>

            <div>
              <p className="text-sm text-charcoal-500">Status</p>
              <p className="text-charcoal font-medium mt-1">
                <span className="inline-block px-3 py-1 bg-success-50 text-success rounded-lg">
                  Active
                </span>
              </p>
            </div>
          </div>

          <p className="text-xs text-charcoal-400 mt-6 p-3 bg-surface-50 rounded-lg">
            <ShieldIcon className="w-4 h-4 inline mr-2" />
            Role and organization details are managed by your administrator.
          </p>
        </motion.div>

      </motion.div>
    </Layout>
  );
}
