import { describe, expect, it } from 'vitest';
import { normalizeEmailProviderError } from '../../../api/email/_shared';

describe('normalizeEmailProviderError', () => {
  it('maps domain verification failures to admin-friendly guidance', () => {
    const message = normalizeEmailProviderError('Invite updated, but email failed. The gmail.com domain is not verified.');
    expect(message).toBe(
      'Email delivery is not configured for the current sender domain. Ask an administrator to verify the sending domain in Resend, then try again.'
    );
  });

  it('maps resend.dev restrictions to admin-friendly guidance', () => {
    const message = normalizeEmailProviderError(
      'You can only send testing emails to your own email address when using onboarding@resend.dev.'
    );
    expect(message).toBe(
      'Email delivery is not configured for the current sender domain. Ask an administrator to verify the sending domain in Resend, then try again.'
    );
  });

  it('keeps unrelated provider errors unchanged', () => {
    const message = normalizeEmailProviderError('Upstream timeout while contacting email provider.');
    expect(message).toBe('Upstream timeout while contacting email provider.');
  });
});
