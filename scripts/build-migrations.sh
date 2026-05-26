#!/usr/bin/env bash
# Concatenate all SQL migrations into one file you can paste into a fresh
# Supabase project's SQL editor.
#
# Order matters: alphabetical breaks because of foreign-key dependencies.
# Explicit priority list runs first (in order), then any remaining add_*
# files (alphabetical), then remove_* files last.
set -euo pipefail

cd "$(dirname "$0")/.."

# Ordered dependency chain — must run in this sequence:
#   - companies/context/disputes/variations create tables that later files reference
#   - dispute_evidence/dispute_questions need disputes
#   - outbound_emails references projects, field_logs, rfis, variations, disputes
#   - workpoints_and_outputs references project_context and outbound_emails
#   - inbox_intelligence references outbound_emails
PRIORITY=(
  supabase/schema.sql
  supabase/add_companies.sql
  supabase/add_context.sql
  supabase/add_disputes.sql
  supabase/add_variations.sql
  supabase/add_dispute_evidence.sql
  supabase/add_dispute_questions.sql
  supabase/add_outbound_emails.sql
  supabase/add_workpoints_and_outputs.sql
  supabase/add_inbox_intelligence.sql
  supabase/add_whatsapp_tables.sql
  supabase/add_whatsapp_routing.sql
  supabase/add_wa_pending_state.sql
)

OUT="supabase/_all_migrations.sql"

# Membership check that works on macOS Bash 3.x — no associative arrays.
SEEN_LIST=""
is_seen() {
  case " $SEEN_LIST " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

emit() {
  local f="$1"
  echo
  echo "-- ────────── $f ──────────"
  cat "$f"
  echo
  SEEN_LIST="$SEEN_LIST $f"
}

{
  echo "-- ============================================================"
  echo "-- Punchlister — consolidated migrations"
  echo "-- Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "-- Paste into Supabase SQL editor on a FRESH project."
  echo "-- ============================================================"

  for f in "${PRIORITY[@]}"; do
    [ -f "$f" ] && emit "$f"
  done

  # Remaining add_* files — order between them doesn't matter (they only
  # reference tables from schema.sql or auth.users)
  for f in supabase/add_*.sql; do
    is_seen "$f" && continue
    emit "$f"
  done

  # Destructive operations last
  for f in supabase/remove_*.sql; do
    is_seen "$f" && continue
    emit "$f"
  done
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines)"
