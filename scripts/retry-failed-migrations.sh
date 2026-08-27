#!/usr/bin/env bash
# Re-apply migrations that failed during the full sync pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/docs/migrations/_apply_log_retry_$(date +%Y%m%d_%H%M%S).txt"

FAILED=(
  document_management_metadata_restrictions_expiry_2026_04_28.sql
  hr_documents_module_2026_03_03.sql
  hr_module_2026_02_24.sql
  hr_rls_personnel_and_self_service_2026_03_21.sql
  legal_requirements_register_and_updates.sql
  license_activation_schema.sql
  objectives_targets_2026_05_04.sql
  objectives_targets_progress_notes_2026_05_25.sql
  owner_rls_onboarding_fix_2026_02_25.sql
  permit_to_work_types_approval_2026_08_27.sql
  rbac_consultant_scope_and_trial_export.sql
  review_meetings_module.sql
  risk_assessments_enterprise_upgrade_2026_03_05.sql
  rls_hotfix_owner_tenant_and_missing_tables_2026_02_27.sql
  roadmap_phase1_compliance_automation_billing_2026_04_22.sql
  sheq_toolbox_talks_permit_loto_2026_06.sql
  training_providers_contact_details_2026_08_20.sql
  training_records_hr_employee_link_2026_08_20.sql
)

strip_sql() {
  local file="$1"
  grep -v '^[[:space:]]*--' "$file" | awk 'NF{print}'
}

FAIL=0
for name in "${FAILED[@]}"; do
  file="docs/migrations/$name"
  if [ ! -f "$file" ]; then
    echo "MISSING: $name" | tee -a "$LOG"
    FAIL=$((FAIL + 1))
    continue
  fi
  sql="$(strip_sql "$file")"
  echo "APPLY: $name" | tee -a "$LOG"
  if npx @insforge/cli db query "$sql" --yes >>"$LOG" 2>&1; then
    echo "  OK: $name" | tee -a "$LOG"
  else
    echo "  FAIL: $name (see log)" | tee -a "$LOG"
    FAIL=$((FAIL + 1))
    sleep 2
  fi
done

npx @insforge/cli db query "NOTIFY pgrst, 'reload schema';" --yes >>"$LOG" 2>&1 || true
echo "Done. Failures: $FAIL. Log: $LOG"
