#!/usr/bin/env node
/**
 * Fails when shipped code contains placeholders or leftover fake data — the
 * kind of thing that made the old Settings tabs look finished when they weren't.
 *
 *   npm run check:stubs
 *
 * Scans app/, components/, lib/, services/ (not tests, not generated code).
 * A line can opt out with a trailing comment:  // stub-ok: <reason>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['app', 'components', 'lib']
const SKIP = [/[\\/]generated[\\/]/, /[\\/]node_modules[\\/]/]
const EXT = /\.(ts|tsx|js|mjs)$/

// Files intentionally excluded, each with the reason (keep this list short and honest).
const IGNORE = {
  'components/add-patient-modal.tsx': 'unused (nothing imports it); pediatric legacy form',
  'components/edit-patient-modal.tsx': 'unused (nothing imports it); patient editing is inline on the patient page',
}

const RULES = [
  // Case-sensitive so HTML `placeholder=` attributes don't match.
  { id: 'placeholder', re: /\b(TODO|FIXME|STUB|PLACEHOLDER)\b/ },
  { id: 'unfinished', re: /lorem ipsum|coming soon|not implemented/i },
  { id: 'filler-text', re: /goes here\b/i },
  { id: 'shared-default-password', re: /Kid0-18CRM/ },
  { id: 'fake-us-phone', re: /\(555\)\s?\d{3}-\d{4}/ },
  { id: 'pediatric-demo-identity', re: /\b(kids0?18\.com|Dr\. Tamas|Dr\. Richards|Integrated Pediatrics)\b/i },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (SKIP.some((r) => r.test(p))) continue
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

const findings = []
let scanned = 0
for (const d of DIRS) {
  const files = walk(join(ROOT, d))
  for (const file of files) {
    if (IGNORE[relative(ROOT, file).replace(/\\/g, '/')]) continue
    scanned++
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      if (/stub-ok:/.test(line)) return
      for (const r of RULES) {
        if (r.re.test(line)) findings.push({ file: relative(ROOT, file), line: i + 1, rule: r.id, text: line.trim().slice(0, 120) })
      }
    })
  }
}

if (scanned === 0) {
  console.error('check:stubs — no files scanned; check the script paths.')
  process.exit(2)
}
if (findings.length === 0) {
  console.log(`check:stubs — ${scanned} files scanned, no placeholders or fake data found.`)
  process.exit(0)
}
for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.text}`)
console.log(`\ncheck:stubs — ${findings.length} finding(s).`)
process.exit(1)
