import { createHash, randomBytes } from 'node:crypto';

export type InviteStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED' | 'REVOKED';

export function normalizeInviteStatus(status: unknown): string {
  return String(status ?? '').trim().toUpperCase();
}

export function generateRawInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim()).digest('hex');
}

export function buildInviteLink(rawToken: string, appUrl?: string): string {
  const base = (appUrl || process.env.APP_URL || process.env.VITE_APP_URL || 'https://safe-cloud-africa.vercel.app').replace(/\/+$/, '');
  return `${base}/invite/accept?token=${encodeURIComponent(rawToken)}`;
}

export function mapInvalidReason(statusOrReason: string): 'not_found' | 'expired' | 'revoked' | 'accepted' {
  const value = normalizeInviteStatus(statusOrReason);
  if (value === 'EXPIRED') return 'expired';
  if (value === 'ACCEPTED') return 'accepted';
  if (value === 'CANCELLED' || value === 'REVOKED') return 'revoked';
  return 'not_found';
}

export function toInviteEmailHtml(input: {
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  inviteLink: string;
  expiresAtIso: string;
}): { subject: string; html: string; text: string } {
  const expiryDate = new Date(input.expiresAtIso);
  const expiresText = Number.isNaN(expiryDate.getTime()) ? input.expiresAtIso : expiryDate.toLocaleDateString();
  const subject = `You've been invited to join ${input.orgName} on SafeCloud Africa`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7f8;padding:24px;color:#12212b;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dde5e8;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <h1 style="margin:0;font-size:20px;line-height:1.3;">SafeCloud Africa Invitation</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px 0;">Hello,</p>
          <p style="margin:0 0 14px 0;">
            <strong>${input.inviterName}</strong> (${input.inviterEmail}) invited you to join
            <strong>${input.orgName}</strong> as <strong>${input.role}</strong>.
          </p>
          <p style="margin:0 0 22px 0;">
            <a href="${input.inviteLink}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
              Accept Invitation
            </a>
          </p>
          <p style="margin:0;color:#405562;">This invite expires on ${expiresText}. If you did not expect this, ignore this email.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    subject,
    '',
    `${input.inviterName} (${input.inviterEmail}) invited you to join ${input.orgName} as ${input.role}.`,
    `Accept invitation: ${input.inviteLink}`,
    `Expires on: ${expiresText}`
  ].join('\n');

  return { subject, html, text };
}
