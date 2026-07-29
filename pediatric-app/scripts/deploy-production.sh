#!/usr/bin/env bash
# Production deploy for Hostinger VPS (/var/www/kids018-crm)
# Git default branch: master (not main)
# PM2 processes: kids018-crm, kids018-worker (NOT kids018-server)

set -euo pipefail

cd /var/www/kids018-crm

echo "==> Pulling latest (master)..."
git pull origin master

echo "==> Installing dependencies..."
npm install

echo "==> Prisma generate + migrate..."
npx prisma generate
npx prisma migrate deploy

echo "==> Building Next.js..."
npm run build

echo "==> Restarting PM2 processes..."
pm2 restart kids018-crm
pm2 restart kids018-worker

echo "==> Done. Status:"
pm2 status
