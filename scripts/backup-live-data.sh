#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/apps/customerportal/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/apps/customerportal/backups}"
DB_NAME="${DB_NAME:-customer_portal}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/security-backup-$STAMP"

echo "Creating backup at $BACKUP_DIR"
sudo mkdir -p "$BACKUP_DIR"

if command -v pg_dump >/dev/null 2>&1; then
  echo "Backing up PostgreSQL database $DB_NAME"
  sudo -u postgres pg_dump -d "$DB_NAME" -Fc -f "$BACKUP_DIR/$DB_NAME.dump"
else
  echo "pg_dump not found; skipping PostgreSQL backup"
fi

if [ -d "$APP_DIR/data" ]; then
  echo "Backing up app data folder"
  sudo rsync -a "$APP_DIR/data/" "$BACKUP_DIR/data/"
else
  echo "App data folder not found at $APP_DIR/data"
fi

if [ -f "$APP_DIR/.env" ]; then
  echo "Saving redacted env variable names"
  sudo awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1"=REDACTED"}' "$APP_DIR/.env" > "$BACKUP_DIR/env.keys.txt"
fi

sudo chown -R "${SUDO_USER:-$(whoami)}:${SUDO_USER:-$(whoami)}" "$BACKUP_DIR" 2>/dev/null || true
echo "Backup complete: $BACKUP_DIR"
