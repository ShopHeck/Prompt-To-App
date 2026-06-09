#!/usr/bin/env bash
#
# Database backup script using pg_dump (custom format).
# Supports BACKUP_DIR env var (default: ./backups/) and retention policy.
#
# Usage:
#   ./scripts/backup-db.sh
#
# Environment variables:
#   DATABASE_URL  - Postgres connection string (required)
#   BACKUP_DIR   - Directory to store backups (default: ./backups/)
#   RETENTION_DAYS - Days to keep old backups (default: 30)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.dump"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is required" >&2
  exit 1
fi

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup at $(date -Iseconds)..."
echo "  Target: ${BACKUP_FILE}"

# Run pg_dump with custom format for efficient compression and selective restore
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="${BACKUP_FILE}"

BACKUP_SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null || echo "unknown")
echo "Backup completed successfully."
echo "  File: ${BACKUP_FILE}"
echo "  Size: ${BACKUP_SIZE} bytes"

# Retention policy: delete backups older than RETENTION_DAYS
echo "Applying retention policy (${RETENTION_DAYS} days)..."
DELETED_COUNT=0
while IFS= read -r old_file; do
  if [ -n "${old_file}" ]; then
    echo "  Deleting old backup: ${old_file}"
    rm -f "${old_file}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  fi
done < <(find "${BACKUP_DIR}" -name "backup_*.dump" -type f -mtime +"${RETENTION_DAYS}" 2>/dev/null)

echo "Retention cleanup complete. Removed ${DELETED_COUNT} old backup(s)."
echo "Backup finished at $(date -Iseconds)."
