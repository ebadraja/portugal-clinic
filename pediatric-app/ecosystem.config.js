/**
 * PM2 Ecosystem Config
 * Runs two processes on the VPS:
 *   1. kids018-crm     — Next.js web server
 *   2. kids018-worker  — Email queue worker
 *
 * NOTE: Process names are kids018-crm / kids018-worker (there is no kids018-server).
 * Git remote default branch is master (not main).
 *
 * Deploy on VPS:
 *   bash scripts/deploy-production.sh
 *   — or manually: git pull origin master && npm install && npx prisma generate &&
 *     npx prisma migrate deploy && npm run build && pm2 restart kids018-crm kids018-worker
 */

module.exports = {
  apps: [
    {
      name:        'kids018-crm',
      script:      'node_modules/.bin/next',
      args:        'start',
      cwd:         '/var/www/kids018-crm',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      env: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
    },
    {
      name:        'kids018-worker',
      // Run the TS worker via npm script (tsx) in fork mode. Cluster mode does
      // not work with tsx — the process shows "online" but never runs the code.
      script:      'npm',
      args:        'run worker',
      cwd:         '/var/www/kids018-crm',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
