// Thin re-export so every existing `import { paaq } from '../lib/paaq'` call
// site in this app keeps working unchanged, while the actual implementation
// now comes from the real, maintained @paaq/web-sdk package instead of a
// hand-copied, increasingly stale local file (no device metadata, no click
// tracking, no session-replay recording, and identify() never actually
// linked a user — all fixed in the current package).
export { paaq } from '@paaq/web-sdk'

import { paaq } from '@paaq/web-sdk'

export interface FormFieldErrorContext {
  /** The page or component where the error occurred, e.g. 'BillingPricingPage' */
  component?: string
  /** Additional arbitrary metadata to attach to the error event */
  [key: string]: unknown
}

/**
 * Track a form field validation or SDK-level error through the PAAQ analytics
 * layer so that silent failures are visible in observability dashboards.
 *
 * This fills the blind spot where form validation errors and payment SDK
 * initialisation failures do not throw uncaught JS exceptions and therefore
 * are not captured by the standard error monitor.
 *
 * @param fieldName  Dot-notation field identifier, e.g. 'payment.cardNumber'
 * @param errorType  Short machine-readable label, e.g. 'validation_failure' | 'sdk_init_failure'
 * @param context    Optional extra metadata (component name, user-facing message, etc.)
 */
export function trackFormFieldError(
  fieldName: string,
  errorType: string,
  context: FormFieldErrorContext = {}
): void {
  try {
    paaq.track('form_field_error', {
      fieldName,
      errorType,
      timestamp: new Date().toISOString(),
      ...context,
    })
  } catch (err) {
    // Never let telemetry instrumentation break the user-facing flow.
    // Log to console so the error is at least visible in developer tools.
    console.error('[paaq] trackFormFieldError failed to emit event', err)
  }
}
