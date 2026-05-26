import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { AuthShell } from '../../components/auth/AuthShell';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useUser } from '@insforge/react';
import {
  acceptInvite,
  acceptInviteByToken,
  getInviteById,
  toUserInviteMessage,
  validateInvitationToken,
  type InviteValidationResult
} from '../../api/services/tenantService';
import { useTenant } from '../../tenant/TenantContext';
import type { CompanyInvite } from '../../api/models/entities';
import { getDashboardRoute } from '../../api/services/platformAdminService';
import { clearPendingInviteContext, savePendingInviteContext } from '../../auth/pendingAuthRedirect';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

function inviteErrorForCode(code: InviteValidationResult['code']): string {
  if (code === 'INVITE_EXPIRED') return 'This invite has expired. Please request a new invite.';
  if (code === 'INVITE_ACCEPTED') return 'This invite has already been used.';
  if (code === 'BACKEND_UNAVAILABLE') return 'We could not validate this invite right now. Please try again.';
  return 'This invite link is invalid.';
}

function inviteTitleForCode(code: InviteValidationResult['code'] | null): string {
  if (code === 'BACKEND_UNAVAILABLE') return 'Invite System Error';
  return 'Invite Error';
}

export function InviteAcceptPage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const { refreshTenant, setActiveCompanyId } = useTenant();

  const token = searchParams.get('token')?.trim() ?? '';

  const [invite, setInvite] = useState<CompanyInvite | null>(null);
  const [companyName, setCompanyName] = useState<string>('Organization');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<InviteValidationResult['code'] | null>(null);
  const [success, setSuccess] = useState(false);

  const redirectToLogin = useMemo(() => `/login?redirect=${encodeURIComponent(`/invite/accept?token=${token}`)}`, [token]);
  const redirectToRegister = useMemo(() => `/register?redirect=${encodeURIComponent(`/invite/accept?token=${token}`)}&inviteToken=${encodeURIComponent(token)}&email=${encodeURIComponent(invite?.email ?? '')}`, [token, invite?.email]);
  const saveInviteContinuation = React.useCallback(() => {
    if (!token) return;
    savePendingInviteContext({
      token,
      email: invite?.email ?? null,
      redirectPath: `/invite/accept?token=${encodeURIComponent(token)}`
    });
  }, [invite?.email, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        if (token) {
          const validation = await validateInvitationToken(token);
          if (cancelled) return;
          if (validation.code !== 'OK' || !validation.invite) {
            setErrorCode(validation.code);
            setError(inviteErrorForCode(validation.code));
            setLoading(false);
            return;
          }
          setInvite(validation.invite as CompanyInvite);
          setCompanyName(validation.invite.organization_name ?? validation.invite.company_name ?? 'Organization');
          savePendingInviteContext({
            token,
            email: validation.invite.email,
            redirectPath: `/invite/accept?token=${encodeURIComponent(token)}`
          });
          setLoading(false);
          return;
        }

        if (!inviteId) {
          setErrorCode('INVITE_INVALID');
          setError('This invite link is invalid.');
          setLoading(false);
          return;
        }

        const inviteData = await getInviteById(inviteId as any);
        if (cancelled) return;
        setInvite(inviteData);
        setCompanyName((inviteData as any)?.company?.name ?? 'Organization');
      } catch (err: any) {
        if (!cancelled) {
          setErrorCode('BACKEND_UNAVAILABLE');
          setError(toUserInviteMessage(err?.message || 'Failed to load invite.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteId, token]);

  useEffect(() => {
    if (!isLoaded || !user?.id || !invite || accepting || success) return;

    const userEmail = String(user.email ?? '').toLowerCase();
    const inviteEmail = String(invite.email ?? '').toLowerCase();
    if (!userEmail || !inviteEmail || userEmail !== inviteEmail) return;

    let cancelled = false;

    async function autoAccept() {
      try {
        setAccepting(true);
        setError(null);
        const membership = token
          ? await acceptInviteByToken({ token, userId: user.id })
          : await acceptInvite({ inviteId: invite.id, userId: user.id });
        if (cancelled) return;
        setActiveCompanyId(membership.company_id);
        await refreshTenant();
        clearPendingInviteContext();
        setSuccess(true);
        setTimeout(() => {
          navigate(getDashboardRoute(membership.role), { replace: true });
        }, 900);
      } catch (err: any) {
        if (!cancelled) setError(toUserInviteMessage(err?.message || 'Failed to accept invite.'));
      } finally {
        if (!cancelled) setAccepting(false);
      }
    }

    void autoAccept();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id, user?.email, invite, token, accepting, success, refreshTenant, setActiveCompanyId, navigate]);

  if (loading) {
    return (
      <AuthShell title="Loading invite..." subtitle="">
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
            <h3 className="text-lg font-semibold text-critical mb-2">{inviteTitleForCode(errorCode)}</h3>
            <p className="text-charcoal-600">{error}</p>
            <Link to="/login" className="inline-flex mt-4 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">
              Request new invite
            </Link>
          </motion.div>
        </motion.div>
      </AuthShell>
    );
  }

  if (!invite) return null;

  const emailMatches = String(user?.email ?? '').toLowerCase() === String(invite.email ?? '').toLowerCase();

  return (
    <>
      <LoadingOverlay show={accepting} title="Accepting invite..." message="Setting up your workspace." />
      <AuthShell title="Company Invite" subtitle="You've been invited to join a workspace">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={itemVariants} className="bg-white border border-surface-300 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-teal-50 rounded-xl">
                <Building2Icon className="w-6 h-6 text-teal-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-charcoal">Join {companyName}</h3>
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
              <h3 className="text-lg font-semibold text-success mb-2">Welcome aboard</h3>
              <p className="text-charcoal-600">Redirecting to your organization dashboard...</p>
            </motion.div>
          ) : (
            <>
              {!user?.id ? (
                <motion.div variants={itemVariants} className="bg-surface-50 border border-surface-200 rounded-xl p-6">
                  <h4 className="font-semibold text-charcoal mb-2">Sign in to accept this invite</h4>
                  <p className="text-sm text-charcoal-600 mb-4">
                    Use <strong>{invite.email}</strong> to sign in or create your account, then the invite will be accepted automatically.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link to={redirectToLogin} onClick={saveInviteContinuation} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Login to accept invite</Link>
                    <Link to={redirectToRegister} onClick={saveInviteContinuation} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-semibold text-charcoal hover:bg-surface-50">Create account</Link>
                  </div>
                </motion.div>
              ) : !emailMatches ? (
                <motion.div variants={itemVariants} className="bg-warning-50 border border-warning/20 rounded-xl p-6">
                  <h4 className="font-semibold text-warning mb-2">Email Mismatch</h4>
                  <p className="text-sm text-charcoal-600">
                    This invite is for <strong>{invite.email}</strong>, but you're signed in as <strong>{user?.email}</strong>. Please sign out and sign in with the invited email.
                  </p>
                  <div className="mt-4">
                    <Link to={redirectToLogin} onClick={saveInviteContinuation} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Sign in with invited email</Link>
                  </div>
                </motion.div>
              ) : (
                <motion.div variants={itemVariants} className="bg-surface-50 border border-surface-200 rounded-xl p-6">
                  <h4 className="font-semibold text-charcoal mb-2">Finalizing your invitation</h4>
                  <p className="text-sm text-charcoal-600">Please wait while we attach your organization access and role.</p>
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
