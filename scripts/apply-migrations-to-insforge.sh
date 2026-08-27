#!/usr/bin/env bash
# Apply all docs/migrations/*.sql files to InsForge (idempotent SQL only).
# Strips line comments, runs each file, logs results.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/docs/migrations/_apply_log_$(date +%Y%m%d_%H%M%S).txt"
mkdir -p "$(dirname "$LOG")"

strip_sql() {
  local file="$1"
  grep -v '^[[:space:]]*--' "$file" | awk 'NF{print}'
}

apply_file() {
  local file="$1"
  local name
  name="$(basename "$file")"
  local sql
  sql="$(strip_sql "$file")"
  if [ -z "${sql//[[:space:]]/}" ]; then
    echo "SKIP (empty): $name" | tee -a "$LOG"
    return 0
  fi
  echo "APPLY: $name" | tee -a "$LOG"
  if npx @insforge/cli db query "$sql" --yes >>"$LOG" 2>&1; then
    echo "  OK: $name" | tee -a "$LOG"
    return 0
  else
    echo "  FAIL: $name (see log)" | tee -a "$LOG"
    return 1
  fi
}

FAIL=0
for file in $(ls -1 docs/migrations/*.sql 2>/dev/null | sort); do
  case "$(basename "$file")" in
    _apply_log_*) continue ;;
  esac
  apply_file "$file" || FAIL=$((FAIL + 1))
done

echo "Reloading PostgREST schema cache..." | tee -a "$LOG"
npx @insforge/cli db query "NOTIFY pgrst, 'reload schema';" --yes >>"$LOG" 2>&1 || true

echo "Done. Failures: $FAIL. Log: $LOG"
exit "$FAIL"
