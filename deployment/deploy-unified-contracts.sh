#!/usr/bin/env bash
set -euo pipefail

UPLOAD="$HOME/uploads/customerportal-upload.tgz"
UPLOAD_SHA="$HOME/uploads/customerportal-upload.sha256.txt"
STAGE="$HOME/uploads/customerportal"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "== Contract Portal unified deploy =="
echo "Timestamp: $STAMP"

test -f "$UPLOAD"

if [ -f "$UPLOAD_SHA" ]; then
  expected_hash="$(awk '{print $1}' "$UPLOAD_SHA" | head -n 1 | tr '[:upper:]' '[:lower:]')"
  actual_hash="$(sha256sum "$UPLOAD" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')"
  if [ "$expected_hash" != "$actual_hash" ]; then
    echo "Package hash mismatch."
    echo "Expected: $expected_hash"
    echo "Actual:   $actual_hash"
    exit 1
  fi
  echo "Package hash verified: $actual_hash"
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$UPLOAD" -C "$STAGE"

echo "Verifying staged Contract Portal files..."
test -f "$STAGE/package.json"
test -f "$STAGE/package-lock.json"
test -f "$STAGE/server/index.js"
test -f "$STAGE/public/home.html"
test -f "$STAGE/public/installer-photos.html"
test -f "$STAGE/server/installer-uploads.js"

if [ -d "$STAGE/InstallerPortal" ]; then
  echo "Verifying staged InstallerPortal files..."
  test -f "$STAGE/InstallerPortal/package.json"
  test -f "$STAGE/InstallerPortal/package-lock.json"
  test -f "$STAGE/InstallerPortal/server.js"
  test -f "$STAGE/InstallerPortal/public/index.html"
fi

echo "Requesting sudo access for backup/deploy..."
sudo -v

echo "Creating deploy backups..."
sudo mkdir -p /opt/backups/customerportal /opt/backups/installerportal

if [ -d /opt/apps/customerportal/app ]; then
  sudo tar -czf "/opt/backups/customerportal/customerportal-app-before-unified-$STAMP.tgz" \
    --exclude=node_modules \
    --exclude=data/generated \
    --exclude=data/packets \
    --exclude=data/logs \
    --exclude=data/settings \
    --exclude=data/estimates \
    --exclude=data/estimate-module \
    --exclude=data/preimport \
    --exclude=data/quick-contracts \
    -C /opt/apps/customerportal/app .
  echo "Contract Portal backup: /opt/backups/customerportal/customerportal-app-before-unified-$STAMP.tgz"
fi

if [ -d /opt/apps/installerportal/app ]; then
  sudo tar -czf "/opt/backups/installerportal/installerportal-app-before-unified-$STAMP.tgz" \
    --exclude=node_modules \
    --exclude=data/installers/installer-job-photos \
    --exclude=data/notifications \
    --exclude='data/*.log' \
    -C /opt/apps/installerportal/app .
  echo "InstallerPortal backup: /opt/backups/installerportal/installerportal-app-before-unified-$STAMP.tgz"
fi

echo "Deploying Contract Portal app files..."
sudo rsync -av --delete \
  --exclude InstallerPortal \
  --exclude node_modules \
  --exclude .env \
  --exclude 'data/generated' \
  --exclude 'data/packets' \
  --exclude 'data/logs' \
  --exclude 'data/settings' \
  --exclude 'data/estimates' \
  --exclude 'data/estimate-module' \
  --exclude 'data/preimport' \
  --exclude 'data/quick-contracts' \
  "$STAGE/" /opt/apps/customerportal/app/

sudo chown -R customerportal:customerportal /opt/apps/customerportal/app

echo "Installing Contract Portal dependencies..."
cd /opt/apps/customerportal/app
sudo -u customerportal npm ci --omit=dev

echo "Restarting Contract Portal..."
sudo systemctl restart customerportal
sleep 3
sudo systemctl is-active --quiet customerportal
curl -fsS http://127.0.0.1:3000/api/health
echo

if [ -d "$STAGE/InstallerPortal" ] && [ -d /opt/apps/installerportal/app ]; then
  echo "Deploying InstallerPortal app files..."
  sudo rsync -av --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude 'data/installers/installer-job-photos' \
    --exclude 'data/notifications' \
    --exclude 'data/*.log' \
    "$STAGE/InstallerPortal/" /opt/apps/installerportal/app/

  sudo chown -R installerportal:installerportal /opt/apps/installerportal/app

  echo "Installing InstallerPortal dependencies..."
  cd /opt/apps/installerportal/app
  sudo -u installerportal npm ci --omit=dev

  echo "Restarting InstallerPortal..."
  sudo systemctl restart installerportal
  sleep 3
  sudo systemctl is-active --quiet installerportal
  curl -fsS http://127.0.0.1:3011/api/health
  echo
else
  echo "InstallerPortal deploy skipped because staged app or /opt/apps/installerportal/app was not present."
fi

echo "Checking Nginx contract route..."
curl -fsS -H "Host: contracts.edgefam.com" http://127.0.0.1/api/health
echo

echo "Checking HTTPS contract route from server..."
curl -kfsS --resolve contracts.edgefam.com:443:127.0.0.1 https://contracts.edgefam.com/api/health
echo

echo "Unified deploy complete: $STAMP"
