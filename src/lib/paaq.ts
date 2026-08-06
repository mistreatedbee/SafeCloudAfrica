// Thin re-export so every existing `import { paaq } from '../lib/paaq'` call
// site in this app keeps working unchanged, while the actual implementation
// now comes from the real, maintained @paaq/web-sdk package instead of a
// hand-copied, increasingly stale local file (no device metadata, no click
// tracking, no session-replay recording, and identify() never actually
// linked a user — all fixed in the current package).
export { paaq } from '@paaq/web-sdk'
