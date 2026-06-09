#!/usr/bin/env bash
#
# Database restore script using pg_restore.
#
# Usage:
#   ./scripts/restore-db.sh <backup_file>
#
# Environment variables:
#   DATABASE_URL  - Postgres connection string (required)

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file path is required as first argument" >&2
  echo "Usage: $0 <backup_file>" >&2
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is required" >&2
  exit 1
fi

echo "=== DATABASE RESTORE ==="
echo "  Source: ${BACKUP_FILE}"
echo "  Target: ${DATABASE_URL}"
echo ""
echo "WARNING: This will overwrite existing data in the target database."
echo ""

# Allow non-interactive mode via RESTORE_CONFIRM=yes
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  read -rp "Type 'yes' to confirm restore: " CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

echo ""
echo "Starting restore at $(date -Iseconds)..."

# Use pg_restore with --clean to drop existing objects before recreating
pg_restore "${BACKUP_FILE}" \
  --dbname="${DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose

echo ""
echo "Restore completed successfully at $(date -Iseconds)."
