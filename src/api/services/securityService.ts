import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

export interface SecuritySettings {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  mfaRequired: boolean;
  mfaMethod: 'totp' | 'sms' | 'email';
}

/**
 * Validate password against company security policy
 */
export async function validatePasswordStrength(
  companyId: string,
  password: string
): Promise<{ valid: boolean; errors: string[] }> {
  // Get company security settings (stored in metadata for now)
  const { data: company } = await insforge.database
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single();

  const settings: Partial<SecuritySettings> = company?.metadata?.security || {};

  const errors: string[] = [];
  const minLength = settings.passwordMinLength || 8;

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  if (settings.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (settings.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (settings.passwordRequireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (settings.passwordRequireSymbols && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if MFA is required for a user
 */
export async function isMfaRequired(companyId: string): Promise<boolean> {
  const { data: company } = await insforge.database
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single();

  return company?.metadata?.security?.mfaRequired || false;
}

/**
 * Get session timeout for company
 */
export async function getSessionTimeoutMinutes(companyId: string): Promise<number> {
  const { data: company } = await insforge.database
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single();

  return company?.metadata?.security?.sessionTimeoutMinutes || 480; // 8 hours default
}

/**
 * Update company security settings
 */
export async function updateSecuritySettings(
  companyId: string,
  settings: Partial<SecuritySettings>
): Promise<void> {
  await ensureInsforgeSession();

  // Get current metadata
  const { data: company } = await insforge.database
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single();

  const currentMetadata = company?.metadata || {};
  const updatedMetadata = {
    ...currentMetadata,
    security: {
      ...currentMetadata.security,
      ...settings
    }
  };

  const { error } = await insforge.database
    .from('companies')
    .update({ metadata: updatedMetadata })
    .eq('id', companyId);

  if (error) throw new Error(`Failed to update security settings: ${error.message}`);
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  companyId: string,
  userId: string,
  event: string,
  details?: Record<string, any>
): Promise<void> {
  await ensureInsforgeSession();

  const { error } = await insforge.database
    .from('activity_logs')
    .insert({
      company_id: companyId,
      actor_user_id: userId,
      action: 'security_event',
      entity_type: 'security',
      metadata: {
        event,
        ...details,
        timestamp: new Date().toISOString()
      }
    });

  if (error) {
    console.error('Failed to log security event:', error);
    // Don't throw, logging failures shouldn't break the app
  }
}

/**
 * Enforce concurrent session limit
 */
export async function checkConcurrentSessions(companyId: string, userId: string): Promise<boolean> {
  // This would require tracking active sessions
  // For now, return true (allow)
  // In a real implementation, you'd check against a sessions table
  return true;
}
