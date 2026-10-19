#!/usr/bin/env bash
# End-to-end check of the CRM against a throwaway, in-memory Postgres (PGlite).
#
#   npm run build            # the script runs the production build
#   bash scripts/e2e/cycle.sh
#
# Never touches a real database: it starts its own on 127.0.0.1:54329, applies all
# migrations, seeds demo data, starts `next start` on :3100 with test-only secrets and
# blank email credentials (so no real email is sent), runs scripts/e2e/run.mjs, then stops.
# PGlite is installed once into $E2E_TOOLS (default: $TMPDIR/clinic-crm-e2e), not into the app.
set -u
APP="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS="${E2E_TOOLS:-${TMPDIR:-/tmp}/clinic-crm-e2e}"
LOGS="$TOOLS/logs"
DB="postgresql://postgres:postgres@127.0.0.1:54329/postgres"
mkdir -p "$TOOLS" "$LOGS"

if [ ! -d "$TOOLS/node_modules/@electric-sql/pglite-socket" ]; then
  echo "Installing PGlite into $TOOLS (one time)…"
  (cd "$TOOLS" && npm init -y >/dev/null && npm install --no-audit --no-fund @electric-sql/pglite-socket >/dev/null) || { echo "PGlite install failed"; exit 1; }
fi
cp "$APP/scripts/e2e/pglite-server.mjs" "$TOOLS/server.mjs"

(cd "$TOOLS" && node server.mjs 54329 > "$LOGS/pg.log" 2>&1) &
PG=$!
for i in $(seq 1 30); do grep -q PGLITE_READY "$LOGS/pg.log" 2>/dev/null && break; sleep 1; done

cleanup() { kill $NX $PG 2>/dev/null; }
NX=""
trap cleanup EXIT

cd "$APP"
DATABASE_URL="$DB" npx prisma migrate deploy > "$LOGS/migrate.log" 2>&1 || { echo "MIGRATE FAILED"; tail -20 "$LOGS/migrate.log"; exit 1; }
echo "migrations: $(grep -c 'Applying migration' "$LOGS/migrate.log") applied"
DATABASE_URL="$DB" SEED_ADMIN_PASSWORD="Test-Admin-2026!" npx tsx prisma/seed.ts > "$LOGS/seed.log" 2>&1 || { echo "SEED FAILED"; tail -20 "$LOGS/seed.log"; exit 1; }
echo "seed: ok"

DATABASE_URL="$DB" DATABASE_POOL_MAX=1 NEXTAUTH_SECRET="itest-nextauth-secret-0123456789-abcdefghij" \
NEXTAUTH_URL="http://localhost:3100" AUTH_URL="http://localhost:3100" AUTH_TRUST_HOST=true \
VAPI_WEBHOOK_SECRET="itest-vapi-secret" MESSAGING_ENCRYPTION_KEY="itest-encryption-key-0123456789abcdef" CRON_SECRET="itest-cron-secret" \
SMTP_USER="" SMTP_PASS="" SMTP_HOST="" SENDGRID_API_KEY="" HIPPATIZER_API_KEY="" \
node node_modules/next/dist/bin/next start -p 3100 > "$LOGS/next.log" 2>&1 &
NX=$!
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/webhooks/vapi 2>/dev/null | grep -q 200 && break; sleep 1; done

node "$APP/scripts/e2e/run.mjs" http://localhost:3100 "$APP/package.json"
# On Windows, `kill` may not stop node; free the ports if they are still in use:
#   PowerShell: Get-NetTCPConnection -LocalPort 3100,54329 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
