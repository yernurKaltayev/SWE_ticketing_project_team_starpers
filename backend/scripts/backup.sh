#!/bin/sh
# Writes a compressed pg_dump to $BACKUP_DIR and removes dumps older than $BACKUP_KEEP_DAYS.
# Connection settings come from the standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE variables.
# Restore instructions are in README.md.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
target="$BACKUP_DIR/biletflow-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump --format=custom --file="$target.partial"
mv "$target.partial" "$target"
find "$BACKUP_DIR" -name 'biletflow-*.dump' -mtime "+$BACKUP_KEEP_DAYS" -delete
echo "backup written: $target"
