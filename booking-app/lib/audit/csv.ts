/** CSV export of audit rows. Cells are quoted and formula-injection safe. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v)
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export function toAuditCsv(rows: { timestamp: Date; action: string; entity: string; entityId: string | null; user: { email: string } | null; ipAddress: string | null; changes: unknown }[]): string {
  const header = ["timestamp", "action", "entity", "entity_id", "user", "ip", "changes"].join(",")
  const lines = rows.map((r) => [r.timestamp.toISOString(), r.action, r.entity, r.entityId, r.user?.email ?? "system", r.ipAddress, r.changes].map(csvCell).join(","))
  return [header, ...lines].join("\r\n")
}
