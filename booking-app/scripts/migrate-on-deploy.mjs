#!/usr/bin/env node
/**
 * Applies pending Prisma migrations during a Vercel *production* build, before
 * the new code goes live. If a migration fails, the build fails and the
 * current deployment keeps serving — nothing half-deploys.
 *
 * - Runs only when VERCEL_ENV=production (previews and local builds skip it).
 * - Migrates over a direct (non-pooled) connection when one is provided:
 *   DIRECT_URL, or DATABASE_URL_UNPOOLED (Neon via the Vercel integration),
 *   otherwise DATABASE_URL.
 * - Migrations in this repo are additive; see prisma/migrations.
 */
import { spawnSync } from 'node:child_process'

if (process.env.VERCEL_ENV !== 'production') {
  console.log('[migrate-on-deploy] not a Vercel production build — skipping migrations')
  process.exit(0)
}

const source = process.env.DIRECT_URL ? 'DIRECT_URL' : process.env.DATABASE_URL_UNPOOLED ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'
const url = process.env[source]
if (!url) {
  console.error('[migrate-on-deploy] DATABASE_URL is not available to the build — refusing to deploy code that needs new columns')
  process.exit(1)
}

console.log(`[migrate-on-deploy] applying migrations (${source})`)
const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: url },
})
if (res.status !== 0) {
  console.error('[migrate-on-deploy] migration failed — stopping the build so the current deployment stays live')
  process.exit(res.status ?? 1)
}
console.log('[migrate-on-deploy] database is up to date')
