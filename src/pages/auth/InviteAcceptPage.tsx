import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { AuthShell } from '../../components/auth/AuthShell';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useUser } from '@insforge/react';
import { acceptInvite, getInviteById } from '../../api/services/tenantService';
import { useTenant } from '../../tenant/TenantContext';
import type { CompanyInvite } from '../../api/models/entities';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function InviteAcceptPage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const { refreshTenant } = useTenant();

  const [invite, setInvite] = useState<CompanyInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!inviteId) {
      setError('Invalid invite link.');
      setLoading(false);
      return;
    }

    async function loadInvite() {
      try {
        const inviteData = await getInviteById(inviteId);
        setInvite(inviteData);
      } catch (err: any) {
        setError(err.message || 'Failed to load invite.');
      } finally {
        setLoading(false);
      }
    }

    loadInvite();
  }, [inviteId]);

  async function handleAccept() {
    if (!invite || !user) return;

    setAccepting(true);
    setError(null);

    try {
      await acceptInvite({ inviteId: invite.id, userId: user.id });
      await refreshTenant();
      setSuccess(true);
      setTimeout(() => navigate('/app'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite.');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <AuthShell title="Accepting Invite…" subtitle="">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      </AuthShell>
    );
  }

  if (error && !invite) {
    return (
      <AuthShell title="Invite Error" subtitle="">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={itemVariants} className="bg-critical-50 border border-critical/20 rounded-xl p-6 text-center">
            <XCircleIcon className="w-12 h-12 text-critical mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-critical mb-2">Invalid or Expired Invite</h3>
            <p className="text-charcoal-600">{error}</p>
          </motion.div>
        </motion.div>
      </AuthShell>
    );
  }

  if (!invite) return null;

  const emailMatches = String(user?.email ?? '').toLowerCase() === String(invite.email ?? '').toLowerCase();

  return (
    <>
      <LoadingOverlay show={accepting} title="Accepting invite…" message="Setting up your workspace." />
      <AuthShell title="Company Invite" subtitle="You've been invited to join a workspace">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={itemVariants} className="bg-white border border-surface-300 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-teal-50 rounded-xl">
                <Building2Icon className="w-6 h-6 text-teal-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-charcoal">Join {invite.company?.name || 'Company'}</h3>
                <p className="text-sm text-charcoal-500 mt-1">
                  You've been invited as a <span className="font-medium">{invite.role}</span>
                </p>
                <p className="text-sm text-charcoal-500 mt-2">
                  Invite sent to: <span className="font-medium">{invite.email}</span>
                </p>
              </div>
            </div>
          </motion.div>

          {success ? (
            <motion.div variants={itemVariants} className="bg-success-50 border border-success/20 rounded-xl p-6 text-center">
              <CheckCircleIcon className="w-12 h-12 text-success mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-success mb-2">Welcome aboard!</h3>
              <p className="text-charcoal-600">You're now part of the team. Redirecting to your dashboard…</p>
            </motion.div>
          ) : (
            <>
              {!emailMatches ? (
                <motion.div variants={itemVariants} className="bg-warning-50 border border-warning/20 rounded-xl p-6">
                  <h4 className="font-semibold text-warning mb-2">Email Mismatch</h4>
                  <p className="text-sm text-charcoal-600">
                    This invite is for <strong>{invite.email}</strong>, but you're signed in as <strong>{user?.email}</strong>.
                    Please sign in with the correct email address to accept this invite.
                  </p>
                </motion.div>
              ) : (
                <motion.div variants={itemVariants} className="bg-surface-50 border border-surface-200 rounded-xl p-6">
                  <h4 className="font-semibold text-charcoal mb-2">Ready to join?</h4>
                  <p className="text-sm text-charcoal-600 mb-4">
                    Click accept to join the workspace and start collaborating.
                  </p>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {accepting && <LoadingSpinner />}
                    {accepting ? 'Accepting…' : 'Accept Invite'}
                  </button>
                </motion.div>
              )}

              {error && (
                <motion.div variants={itemVariants} className="bg-critical-50 border border-critical/20 rounded-xl p-4">
                  <p className="text-sm font-semibold text-critical">Error</p>
                  <p className="text-sm text-charcoal-600 mt-1">{error}</p>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </AuthShell>
    </>
  );
}
