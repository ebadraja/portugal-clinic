/**
 * Import clients and bookings exported from Zappy — command-line version of
 * Patients → "Import from Zappy" (same code: lib/import/zappyImport.ts).
 *
 *   npx tsx scripts/import-zappy.ts --clients clientes.csv [--bookings marcacoes.csv] [--map scripts/zappy-map.json]
 *       → DRY RUN: reads everything, writes nothing, prints a summary and writes zappy-import-report.csv
 *   … --commit                     → writes (idempotent: re-run at cutover to pick up changes)
 *   … --cancel-missing             → with --commit: cancel imported FUTURE bookings no longer in the export
 *   … --create-next-from-clients   → create upcoming appointments that only appear on client
 *                                    records (next_appointment_date) when no bookings file has them
 *   … --report path.csv            → where to write the row-by-row report
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { prisma } from '../lib/prisma'
import type { ZappyMap } from '../lib/import/zappy'
import { getClinicSettings } from '../lib/clinic/settings'
import { normaliseMap, reportCsv, runZappyImport } from '../lib/import/zappyImport'

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const flag = (name: string) => argv.includes(`--${name}`)
const COMMIT = flag('commit')
const REPORT = arg('report') ?? 'zappy-import-report.csv'
const clientsFile = arg('clients')
const bookingsFile = arg('bookings')
const mapFile = arg('map') ?? 'scripts/zappy-map.json'

if (!clientsFile && !bookingsFile) {
  console.error('Give --clients <file.csv> and/or --bookings <file.csv> (see the header of this script).')
  process.exit(1)
}

async function main() {
  const dbHost = (() => {
    try { return new URL(process.env.DATABASE_URL ?? '').host } catch { return '(unknown)' }
  })()
  console.log(`${COMMIT ? 'IMPORT (writing)' : 'DRY RUN (nothing is written)'} → database ${dbHost}`)

  let rawMap: Partial<ZappyMap> | null = null
  try {
    rawMap = JSON.parse(readFileSync(mapFile, 'utf-8'))
  } catch {
    console.warn(`! No mapping file at ${mapFile} — services become OTHER and no dentist is set. Copy scripts/zappy-map.example.json.`)
  }
  const settings = await getClinicSettings()
  const map = normaliseMap(rawMap, settings.providers.map((p) => p.id))

  const r = await runZappyImport({
    clients: clientsFile ? readFileSync(clientsFile) : null,
    bookings: bookingsFile ? readFileSync(bookingsFile) : null,
    map,
    commit: COMMIT,
    createNextFromClients: flag('create-next-from-clients'),
    cancelMissing: flag('cancel-missing'),
  })

  const cols = (c: Record<string, string>) => Object.entries(c).map(([k, h]) => `${k}="${h}"`).join(', ')
  if (r.clients) {
    console.log(`\nClients: ${r.clients.rows} rows · columns → ${cols(r.clients.columns)}`)
    if (r.clients.unused.length) console.log(`  not imported: ${r.clients.unused.join(', ')}`)
  }
  if (r.bookings) {
    console.log(`\nBookings: ${r.bookings.rows} rows · columns → ${cols(r.bookings.columns)}`)
    if (r.bookings.unused.length) console.log(`  not imported: ${r.bookings.unused.join(', ')}`)
    console.log('\nBookings by status:', r.bookingStatuses)
  }
  if (r.unknownServices.length) {
    console.log(`\nServices not in the mapping file (imported as ${map.defaultType}) — add them to ${mapFile}:`)
    for (const s of r.unknownServices) console.log(`  ${String(s.count).padStart(5)}  ${s.name}`)
  }
  if (r.unknownStaff.length) {
    console.log(`\nStaff not in the mapping file (imported with ${map.defaultProviderId ?? 'no dentist'}):`)
    for (const s of r.unknownStaff) console.log(`  ${String(s.count).padStart(5)}  ${s.name}`)
  }
  if (r.missingFromExport) console.log(`\n${r.missingFromExport} upcoming imported booking(s) are no longer in the export${flag('cancel-missing') ? ' — cancelled' : ' (use --cancel-missing to cancel them)'}.`)
  if (r.nextOnlyOnClients.missing) {
    console.log(`\n${r.nextOnlyOnClients.missing} upcoming appointment(s) appear on client records but not in the bookings export${flag('create-next-from-clients') ? ` — created ${r.nextOnlyOnClients.created}` : ' (export the Zappy appointment list, or re-run with --create-next-from-clients)'}.`)
  }
  if (r.upcomingPerDay.length) {
    console.log('\nUpcoming appointments per day (compare with the Zappy agenda):')
    for (const d of r.upcomingPerDay.slice(0, 31)) console.log(`  ${d.date}  ${d.count}`)
    if (r.upcomingPerDay.length > 31) console.log(`  … ${r.upcomingPerDay.length - 31} more days (see the report)`)
  }
  if (r.remindersPlanned) console.log(`\nReminders are on: planned ${r.remindersPlanned.messages} message(s) for ${r.remindersPlanned.appointments} upcoming appointment(s).`)

  writeFileSync(REPORT, reportCsv(r.report), 'utf-8')
  console.log('\nSummary:', r.counts)
  console.log(`Report: ${REPORT}${COMMIT ? '' : '  (dry run — run again with --commit to write)'}`)
}

main()
  .catch((err) => {
    console.error('\nImport stopped:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
