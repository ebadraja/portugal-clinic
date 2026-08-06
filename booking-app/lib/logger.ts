/**
 * Lightweight file-based logger for webhook events and errors.
 *
 * Writes newline-delimited JSON to ./logs (override with LOG_DIR env var) and
 * also echoes to the console so entries still show up in `pm2 logs`.
 *
 * On the server you can inspect them with:
 *   tail -f logs/webhook.log
 *   tail -f logs/error.log
 *   grep -i hippatizer logs/webhook.log | tail -50
 *
 * HIPAA note: only log non-PHI metadata here (form titles, ids, status,
 * counts). Never pass raw field values / patient data into these functions.
 */

import fs from "fs";
import path from "path";

const LOG_DIR =
  process.env.LOG_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "logs");

const WEBHOOK_LOG = "webhook.log";
const ERROR_LOG = "error.log";

function writeLine(file: string, entry: Record<string, unknown>): void {
  const record = { timestamp: new Date().toISOString(), ...entry };
  const line = JSON.stringify(record) + "\n";

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, file), line);
  } catch (err) {
    // Never let logging crash the request — fall back to console only.
    console.error("[LOGGER] failed to write log file:", err);
  }
}

/**
 * Record a webhook lifecycle event (received / unauthorized / processed / etc.).
 * Pass only non-PHI metadata.
 */
export function logWebhook(
  source: string,
  event: string,
  meta: Record<string, unknown> = {}
): void {
  const entry = { level: "info", source, event, ...meta };
  writeLine(WEBHOOK_LOG, entry);
  console.log(`[WEBHOOK:${source}] ${event}`, meta);
}

/**
 * Record an error with context. Accepts any thrown value.
 */
export function logError(
  context: string,
  error: unknown,
  meta: Record<string, unknown> = {}
): void {
  const entry = {
    level: "error",
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...meta,
  };
  writeLine(ERROR_LOG, entry);
  console.error(`[ERROR:${context}]`, error, meta);
}
