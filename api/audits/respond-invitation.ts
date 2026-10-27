import { getServiceInsforge, nowIso } from '../_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import { hashAuditInvitationToken, isValidResponseStatus } from './_shared.js';

const MODULE = 'api.audits.respond-invitation';

/**
 * Lets an external auditee respond to an audit date-proposal invitation
 * (accept/decline) purely by possessing the token from their invite link --
 * they are not expected to have an account or be a member of the company
 * that invited them, so this can't be done through the normal authenticated
 * client SDK path (which audit_invitation_tokens' RLS policies now
 * correctly restrict to company staff). This endpoint is the service-role
 * exception, mirroring server/invites/acceptHandler.ts's unauthenticated
 * token-resolution pattern: it validates the token itself in application
 * code rather than relying on RLS to do it.
 */

type ServiceClient = ReturnType<typeof getServiceInsforge>;

function getServiceClientOrThrow(): NonNullable<ServiceClient> {
  const service = getServiceInsforge();
  if (!service) {
    const err = new Error('Audit invitation response is not configured. Missing service role key.');
    (err as any).status = 500;
    (err as any).code = 'SERVICE_ROLE_MISSING';
    throw err;
  }
  return service;
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as {
    token?: unknown;
    responseStatus?: unknown;
    selectedDate?: unknown;
    declineReason?: unknown;
  };

  const token = String(body.token ?? '').trim();
  if (!token) return res.status(400).json({ ok: false, error: 'token is required' });
  if (!isValidResponseStatus(body.responseStatus)) {
    return res.status(400).json({ ok: false, error: 'responseStatus must be "accepted" or "declined"' });
  }
  const responseStatus = body.responseStatus;
  const selectedDate = body.selectedDate != null ? String(body.selectedDate) : null;
  const declineReason = body.declineReason != null ? String(body.declineReason) : null;

  let logOrgId: string | null = null;

  try {
    const insforge = getServiceClientOrThrow();
    const tokenHash = hashAuditInvitationToken(token);

    const invitationRes = await insforge.database
      .from('audit_invitation_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (invitationRes.error) throw invitationRes.error;
    const invitation = invitationRes.data as any;
    if (!invitation) {
      return res.status(404).json({ ok: false, reason: 'not_found', error: 'Invitation not found.' });
    }

    logOrgId = String(invitation.company_id || '') || null;

    if (invitation.response_status && invitation.response_status !== 'pending') {
      return res.status(409).json({
        ok: false,
        reason: 'already_responded',
        error: `This invitation has already been ${invitation.response_status}.`
      });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      await insforge.database
        .from('audit_invitation_tokens')
        .update({ response_status: 'expired', updated_at: nowIso() })
        .eq('id', invitation.id);
      return res.status(410).json({ ok: false, reason: 'expired', error: 'This audit invitation token has expired.' });
    }

    const respondedAt = nowIso();
    const invitationUpdateRes = await insforge.database
      .from('audit_invitation_tokens')
      .update({
        response_status: responseStatus,
        selected_date: responseStatus === 'accepted' ? selectedDate : null,
        decline_reason: responseStatus === 'declined' ? declineReason : null,
        responded_date: respondedAt,
        updated_at: respondedAt
      })
      .eq('id', invitation.id)
      .select('*')
      .single();
    if (invitationUpdateRes.error) throw invitationUpdateRes.error;
    if (!invitationUpdateRes.data) throw new Error('Failed to store audit invitation response.');

    const auditRes = await insforge.database
      .from('audits')
      .select('*')
      .eq('id', invitation.audit_id)
      .maybeSingle();
    if (auditRes.error) throw auditRes.error;
    let audit = auditRes.data as any;
    if (!audit) throw new Error('Linked audit not found.');

    const fallbackActorUserId = audit.approved_by_user_id ?? audit.created_by_user_id ?? null;
    const auditUpdates =
      responseStatus === 'accepted' && selectedDate
        ? {
            selected_date: selectedDate,
            status: 'scheduled',
            approved_by_user_id: fallbackActorUserId,
            approved_at: respondedAt,
            date_approval_status: 'approved',
            date_decline_reason: null
          }
        : responseStatus === 'declined'
          ? { date_approval_status: 'declined', date_decline_reason: declineReason }
          : null;

    if (auditUpdates) {
      const auditUpdateRes = await insforge.database
        .from('audits')
        .update({ ...auditUpdates, updated_at: respondedAt })
        .eq('id', invitation.audit_id)
        .eq('company_id', invitation.company_id)
        .select('*')
        .single();
      if (auditUpdateRes.error) throw auditUpdateRes.error;
      audit = auditUpdateRes.data;
    }

    try {
      await insforge.database.from('activity_logs').insert({
        company_id: invitation.company_id,
        actor_user_id: fallbackActorUserId,
        action: 'audits.invites.respond',
        entity_type: 'audit',
        entity_id: invitation.audit_id,
        metadata: { responseStatus, inviteeEmail: invitation.invitee_email }
      });
    } catch {
      // Best-effort audit trail only; never fail the response over this.
    }

    return res.status(200).json({ ok: true, audit, invitation: invitationUpdateRes.data });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: msg,
      organization_id: logOrgId
    });
    sendAlertWebhook({
      kind: 'audit_invitation_response',
      module: MODULE,
      message: msg,
      organization_id: logOrgId
    });
    return res.status(Number(err?.status || 500)).json({
      ok: false,
      code: err?.code,
      error: msg
    });
  }
}
