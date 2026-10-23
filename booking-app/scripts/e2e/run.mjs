// End-to-end checks against a running production build + local PGlite database.
// Usage: node run.mjs <baseUrl> <pgModulePath>
import { createRequire } from 'node:module'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const require = createRequire(process.argv[3] ?? import.meta.url)
const { Client } = require('pg')
const SECRET = 'itest-vapi-secret'
const ADMIN = { email: 'ebadraja1402@gmail.com', password: 'Test-Admin-2026!' }

let pass = 0
let fail = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(`${name} ${detail}`)
    console.log(`  ✗ ${name} ${detail}`)
  }
}

// ── tiny cookie-jar HTTP client ─────────────────────────────────────────────
class Session {
  constructor() { this.cookies = new Map() }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
  store(res) {
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1))
    }
  }
  async req(path, { method = 'GET', body, headers = {}, form } = {}) {
    const h = { ...headers }
    if (this.cookies.size) h.cookie = this.header()
    let payload
    if (form) {
      h['content-type'] = 'application/x-www-form-urlencoded'
      payload = new URLSearchParams(form).toString()
    } else if (body !== undefined) {
      h['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' })
    this.store(res)
    return res
  }
  async json(path, opts) {
    const res = await this.req(path, opts)
    let data = null
    const text = await res.text()
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data, headers: res.headers }
  }
}

async function login(email, password) {
  const s = new Session()
  const csrf = await s.json('/api/auth/csrf')
  const res = await s.req('/api/auth/callback/credentials', { method: 'POST', form: { csrfToken: csrf.data.csrfToken, email, password, callbackUrl: BASE + '/dashboard' } })
  const ok = [...s.cookies.keys()].some((k) => k.includes('session-token'))
  return { s, ok, status: res.status }
}

async function login2fa(email, password, code) {
  const s = new Session()
  const csrf = await s.json('/api/auth/csrf')
  await s.req('/api/auth/callback/credentials', { method: 'POST', form: { csrfToken: csrf.data.csrfToken, email, password, code, callbackUrl: BASE + '/dashboard' } })
  return { s, ok: [...s.cookies.keys()].some((k) => k.includes('session-token')) }
}

// RFC 6238 TOTP, independent of the app's implementation.
function totpNow(secretB32) {
  const { createHmac } = require('node:crypto')
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, val = 0
  const bytes = []
  for (const ch of secretB32) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 255); bits -= 8 } }
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest()
  const o = h[h.length - 1] & 15
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0')
}

const vapi = (body, secret = SECRET) =>
  fetch(BASE + '/api/webhooks/vapi', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-vapi-secret': secret } : {}) }, body: JSON.stringify(body) })

const tool = async (callId, name, args, number = '+351912000111') => {
  const res = await vapi({ message: { type: 'tool-calls', call: { id: callId, customer: { number } }, toolCallList: [{ id: `tc-${Math.random().toString(36).slice(2)}`, function: { name, arguments: JSON.stringify(args) } }] } })
  const data = await res.json()
  return data.results?.[0]?.result ?? `HTTP ${res.status}`
}

// Clinic-time helpers (Europe/Lisbon)
function lisbonOffsetMin(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]))
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000
}
function nextWeekday(minDaysAhead) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + minDaysAhead)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres' })
  await db.connect()

  console.log('\n[1] Access control')
  const anon = new Session()
  const r1 = await anon.req('/api/patients')
  check('unauthenticated API request is redirected to /login by proxy', [302, 303, 307].includes(r1.status) && (r1.headers.get('location') ?? '').includes('/login'), `status=${r1.status}`)
  const bad = await login(ADMIN.email, 'wrong-password')
  check('wrong password does not create a session', !bad.ok)
  const { s: admin, ok } = await login(ADMIN.email, ADMIN.password)
  check('admin signs in with the seeded password', ok)
  if (!ok) throw new Error('cannot continue without a session')

  console.log('\n[2] Clinic settings')
  const clinic = await admin.json('/api/settings/clinic')
  check('GET clinic settings 200', clinic.status === 200, String(clinic.status))
  const mon = clinic.data.businessHours.find((h) => h.day === 'Monday')
  check('Monday 09:30–18:00', mon?.open === '09:30' && mon?.close === '18:00' && mon.enabled)
  check('Saturday closed', clinic.data.businessHours.find((h) => h.day === 'Saturday')?.enabled === false)
  check('timezone Europe/Lisbon, agent Acácia', clinic.data.timezone === 'Europe/Lisbon' && clinic.data.voiceAgent.name === 'Acácia')
  check('no settings warnings after seed', clinic.data.warnings.length === 0, JSON.stringify(clinic.data.warnings))
  const badHours = await admin.json('/api/settings/clinic', { method: 'PATCH', body: { lunchBreak: { enabled: true, start: '14:00', end: '12:30' } } })
  check('invalid lunch break rejected (400)', badHours.status === 400, JSON.stringify(badHours.data))
  const closureDate = nextWeekday(20)
  const save = await admin.json('/api/settings/clinic', { method: 'PATCH', body: { holidays: { observeNationalHolidays: true, closures: [{ date: closureDate, name: 'Feriado municipal (teste)' }] } } })
  check('closure saved', save.status === 200 && save.data.holidays.closures.length === 1, JSON.stringify(save.data).slice(0, 200))
  const unknown = await admin.json('/api/settings/clinic', { method: 'PATCH', body: { practiceName: 'x' } })
  check('unknown fields rejected (strict schema)', unknown.status === 400)
  const auditSettings = await admin.json('/api/audit-logs?entity=settings')
  check('settings change audited with before/after', auditSettings.data.data?.some((r) => r.changes?.section === 'holidays' && r.changes.before && r.changes.after))

  console.log('\n[3] Voice webhook — authentication')
  const noSecret = await vapi({ message: { type: 'tool-calls', toolCallList: [] } }, null)
  check('request without secret refused (401)', noSecret.status === 401, String(noSecret.status))
  const wrongSecret = await vapi({ message: { type: 'end-of-call-report', call: { id: 'x' } } }, 'nope')
  check('wrong secret refused (401)', wrongSecret.status === 401)
  const rejected = await db.query("select count(*)::int as n from voice_webhook_events where outcome='rejected'")
  check('refusals recorded in voice_webhook_events', rejected.rows[0].n >= 2, String(rejected.rows[0].n))

  console.log('\n[4] Voice tools — identity, availability, booking (real DB)')
  const pts = await db.query("select id, first_name, last_name, to_char(date_of_birth, 'YYYY-MM-DD') as dob from patients where status='ACTIVE' order by created_at limit 2")
  const [p1, p2] = pts.rows
  check('seeded patients available', !!p1 && !!p2)
  const CALL = `itest-call-${Date.now()}`
  const firstOnly = await tool(CALL, 'lookup_patient', { child_name: p1.first_name })
  check('legacy first-name-only lookup refused', /nome completo/.test(firstOnly), firstOnly)
  const wrongDob = await tool(CALL, 'lookup_patient', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: '1901-01-01' })
  check('wrong DOB → not found, nothing disclosed', /Não encontrei/.test(wrongDob) && !wrongDob.includes(p1.dob), wrongDob)
  const [y, m, d] = p1.dob.split('-')
  const verified = await tool(CALL, 'lookup_patient', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: `${d}/${m}/${y}` })
  check('name + DOB (DD/MM/YYYY) verifies', verified.startsWith(`Identidade confirmada: ${p1.first_name}`), verified)
  check('lookup result never contains DOB', !verified.includes(p1.dob) && !verified.includes(`${d}/${m}/${y}`))

  const day = nextWeekday(3)
  const avail = await tool(CALL, 'check_availability', { date: day, appointment_type: 'EVALUATION' })
  check('availability lists clinic slots', /Horários livres/.test(avail) && /09:30/.test(avail), avail)
  const closedAvail = await tool(CALL, 'check_availability', { date: closureDate })
  check('closure day refused with next available day', /Feriado municipal \(teste\)/.test(closedAvail) && /próximo dia com vagas/.test(closedAvail), closedAvail)

  const book = await tool(CALL, 'book_appointment', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: p1.dob, date: day, time: '10:00', appointment_type: 'EVALUATION' })
  check('booking succeeds', book.startsWith('Consulta marcada'), book)
  // Read the stored value as text: node-postgres would parse "timestamp" columns in the
  // test machine's local zone, while Prisma (the app) stores and reads them as UTC.
  const appt = await db.query("select id, start_time::text as start_utc, extract(epoch from (end_time - start_time))::int as secs from appointments where patient_id=$1 and booked_via='VOICE_AGENT' and start_time::date = $2::date order by created_at desc limit 1", [p1.id, day])
  const expectedUtc = new Date(Date.parse(`${day}T10:00:00Z`) - lisbonOffsetMin(new Date(`${day}T10:00:00Z`)) * 60000)
  const expectedText = expectedUtc.toISOString().replace('T', ' ').slice(0, 19)
  check('appointment stored at 10:00 Lisbon as UTC', appt.rows[0]?.start_utc === expectedText, `${appt.rows[0]?.start_utc} vs ${expectedText}`)
  check('30-minute evaluation', appt.rows[0]?.secs === 1800, String(appt.rows[0]?.secs))
  const dup = await tool(CALL, 'book_appointment', { full_name: `${p2.first_name} ${p2.last_name}`, date_of_birth: p2.dob, date: day, time: '10:15', appointment_type: 'EVALUATION' })
  check('overlapping booking refused', /já está ocupado/.test(dup), dup)

  // Two simultaneous calls racing for the same free slot: exactly one may win.
  const race = await Promise.all([
    tool(`${CALL}-a`, 'book_appointment', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: p1.dob, date: day, time: '15:00', appointment_type: 'EVALUATION' }),
    tool(`${CALL}-b`, 'book_appointment', { full_name: `${p2.first_name} ${p2.last_name}`, date_of_birth: p2.dob, date: day, time: '15:00', appointment_type: 'EVALUATION' }),
  ])
  check('concurrent bookings for one slot: exactly one succeeds', race.filter((r) => r.startsWith('Consulta marcada')).length === 1, JSON.stringify(race))

  const resched = await tool(CALL, 'reschedule_appointment', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: p1.dob, current_date: day, new_date: day, new_time: '11:00' })
  check('reschedule succeeds', resched.startsWith('Consulta remarcada'), resched)
  const implant = await tool(CALL, 'book_appointment', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: p1.dob, date: day, time: '16:00', appointment_type: 'IMPLANT' })
  check('implant not agent-bookable', /equipa clínica/.test(implant), implant)
  const newPatient = await tool(CALL, 'book_appointment', { full_name: 'Joana Nova Paciente', date_of_birth: '1990-01-01', date: day, time: '16:00', appointment_type: 'EVALUATION' })
  check('unknown caller → new-patient callback rule', /novos pacientes não são marcados/.test(newPatient), newPatient)
  const cb = await tool(CALL, 'create_callback_request', { caller_name: 'Joana Nova', reason: 'Nova paciente, quer avaliação', is_new_patient: true })
  check('callback registered with caller ID', /terminado em 111/.test(cb), cb)
  const ins = await tool(CALL, 'verify_insurance', { plan_name: 'advance care' })
  check('insurance answer from settings', /AdvanceCare/.test(ins), ins)
  const faq = await tool(CALL, 'answer_question', { question: 'quanto custa a consulta de avaliação?' })
  check('FAQ answered from approved knowledge base', /45 €/.test(faq), faq)
  const hours = await tool(CALL, 'get_opening_hours', {})
  check('opening hours answer', /segunda 09:30–18:00/.test(hours), hours)

  console.log('\n[5] End-of-call report filed from what the tools did')
  const eoc = await vapi({ message: { type: 'end-of-call-report', call: { id: CALL, type: 'inboundPhoneCall', customer: { number: '+351912000111' }, startedAt: new Date(Date.now() - 180000).toISOString(), endedAt: new Date().toISOString() }, summary: 'Paciente marcou consulta.', transcript: 'Assistant: Olá\nUser: Quero marcar\nAssistant: Marcado', artifact: { recordingUrl: 'https://storage.vapi.ai/itest-not-a-real-file.wav' }, analysis: { structuredData: { call_outcome: 'BOOKED', caller_intent: 'APPOINTMENT_BOOKING' } }, endedReason: 'customer-ended-call' } })
  check('end-of-call report accepted (201)', eoc.status === 201, String(eoc.status))
  const cl = await db.query("select id, outcome::text, intent::text, patient_id, appointment_id, flag_for_follow_up, appointment_booked from call_logs where vapi_call_id=$1", [CALL])
  const row = cl.rows[0]
  check('call log outcome BOOKED from tool facts', row?.outcome === 'BOOKED', JSON.stringify(row))
  check('call linked to the booked patient', row?.patient_id === p1.id)
  check('call flagged for follow-up (callback during call)', row?.flag_for_follow_up === true)
  const eoc2 = await vapi({ message: { type: 'end-of-call-report', call: { id: CALL } } })
  const eoc2b = await eoc2.json()
  check('duplicate report acknowledged, not re-filed', eoc2.status === 200 && eoc2b.reason === 'duplicate')
  const cbRow = await db.query('select patient_id, is_new_patient, urgency::text from callback_requests where vapi_call_id=$1', [CALL])
  check('callback request stored', cbRow.rows.length === 1 && cbRow.rows[0].is_new_patient === true)

  // A patient registered with a local number is recognised when calling from +351…
  const pt = await admin.json('/api/patients', { method: 'POST', body: { firstName: 'Teste', lastName: 'Telefone', dateOfBirth: '1980-01-01', phone: '912 345 678' } })
  check('patient created with a Portuguese number', pt.status === 201, JSON.stringify(pt.data).slice(0, 120))
  const CALL2 = `${CALL}-phone`
  await vapi({ message: { type: 'end-of-call-report', call: { id: CALL2, type: 'inboundPhoneCall', customer: { number: '+351912345678' } }, summary: 'Pergunta sobre horário.', transcript: 'Assistant: Olá\nUser: A que horas abrem?\nAssistant: Às 09:30', analysis: { structuredData: { call_outcome: 'BOOKED' } }, endedReason: 'customer-ended-call' } })
  const matched = await db.query('select patient_id, outcome::text from call_logs where vapi_call_id=$1', [CALL2])
  check('caller ID +351… matched to the patient saved as "912 345 678"', matched.rows[0]?.patient_id === pt.data.id, JSON.stringify(matched.rows[0]))
  check('model cannot claim BOOKED without a tool booking', !!matched.rows[0] && matched.rows[0].outcome !== 'BOOKED', JSON.stringify(matched.rows[0]))

  console.log('\n[6] Call logs never expose provider recording URLs')
  const logs = await admin.json('/api/call-logs?limit=50')
  const mine = logs.data.data?.find((l) => l.vapiCallId === CALL)
  check('list has hasRecording and no recordingUrl', mine && mine.hasRecording === true && !('recordingUrl' in mine), JSON.stringify(mine ?? {}).slice(0, 200))
  check('no call log in the list exposes recordingUrl', logs.data.data.every((l) => !('recordingUrl' in l)))
  const detail = await admin.json(`/api/call-logs/${row.id}`)
  check('detail has no recordingUrl', detail.status === 200 && !('recordingUrl' in detail.data))
  await db.query("update call_logs set recording_url='https://169.254.169.254/latest/meta-data' where id=$1", [row.id])
  const ssrf = await admin.json(`/api/call-logs/${row.id}/recording`)
  check('recording proxy refuses non-allowlisted host (SSRF guard)', ssrf.status === 502 && /allowlist/.test(ssrf.data.error ?? ''), JSON.stringify(ssrf.data))
  const noAuditOnRefusal = await db.query("select count(*)::int as n from audit_logs where entity='call_recording'")
  check('refused fetch is not logged as a playback', noAuditOnRefusal.rows[0].n === 0)
  // Real streaming path through an allowlisted HTTPS host (small public file on vapi.ai).
  await db.query("update call_logs set recording_url='https://vapi.ai/favicon.ico' where id=$1", [row.id])
  const full = await admin.req(`/api/call-logs/${row.id}/recording`)
  const fullBytes = (await full.arrayBuffer()).byteLength
  check('recording streams through the CRM (200, private, no-store)', full.status === 200 && fullBytes > 0 && (full.headers.get('cache-control') ?? '').includes('no-store'), `${full.status} ${fullBytes}`)
  const part = await admin.req(`/api/call-logs/${row.id}/recording`, { headers: { range: 'bytes=0-99' } })
  const partBytes = (await part.arrayBuffer()).byteLength
  check('Range request answered with 206 + Content-Range (Safari/iOS)', part.status === 206 && /^bytes 0-99\//.test(part.headers.get('content-range') ?? '') && partBytes === 100, `${part.status} ${part.headers.get('content-range')} ${partBytes}`)
  const later = await admin.req(`/api/call-logs/${row.id}/recording`, { headers: { range: 'bytes=100-' } })
  await later.arrayBuffer()
  const recAudit = await db.query("select count(*)::int as n from audit_logs where entity='call_recording'")
  check('each playback start audited once (later chunks are not)', recAudit.rows[0].n === 2, String(recAudit.rows[0].n))

  console.log('\n[7] Callback queue')
  const cbs = await admin.json('/api/callbacks')
  const item = cbs.data.data?.find((c) => c.callerName === 'Joana Nova')
  check('callback visible in queue with open count', !!item && cbs.data.counts.open >= 1)
  const closeNoNote = await admin.json(`/api/callbacks/${item.id}`, { method: 'PATCH', body: { status: 'DONE' } })
  check('closing without an outcome note refused', closeNoNote.status === 400)
  const closed = await admin.json(`/api/callbacks/${item.id}`, { method: 'PATCH', body: { status: 'DONE', resolutionNote: 'Ligado, marcada avaliação' } })
  check('callback closed with note', closed.status === 200 && closed.data.status === 'DONE' && !!closed.data.completedAt)
  const badge = await admin.json('/api/callbacks/new-count')
  check('sidebar badge counts open callbacks', typeof badge.data.count === 'number')

  console.log('\n[8] Kill switch')
  await admin.json('/api/settings/voice-agent', { method: 'PATCH', body: { paused: true } })
  const paused = await tool(`${CALL}-p`, 'book_appointment', { full_name: `${p1.first_name} ${p1.last_name}`, date_of_birth: p1.dob, date: day, time: '16:30', appointment_type: 'EVALUATION' })
  check('paused: booking refused', /temporariamente limitado/.test(paused), paused)
  const pausedCb = await tool(`${CALL}-p`, 'create_callback_request', { caller_name: 'Teste', reason: 'teste' })
  check('paused: callbacks still work', /Pedido registado/.test(pausedCb), pausedCb)
  await admin.json('/api/settings/voice-agent', { method: 'PATCH', body: { paused: false } })
  const vs = await admin.json('/api/settings/voice-agent')
  check('voice settings expose 10 tools + schema + delivery status', vs.data.tools?.length === 10 && !!vs.data.structuredOutputSchema && !!vs.data.delivery?.lastReportAt)

  console.log('\n[9] Staff invite → set password → approval → sign in')
  const email = `itest.${Date.now()}@clinic.pt`
  const inv = await admin.json('/api/staff', { method: 'POST', body: { firstName: 'Rita', lastName: 'Teste', email, role: 'staff' } })
  check('invite returns one-time link (no email provider)', inv.status === 201 && /\/login\?token=/.test(inv.data.inviteUrl ?? '') && inv.data.emailSent === false, JSON.stringify(inv.data).slice(0, 200))
  const token = decodeURIComponent((inv.data.inviteUrl ?? '').split('token=')[1] ?? '')
  const pre = await login(email, 'Kid0-18CRM')
  check('old shared default password does not work', !pre.ok)
  const tk = await anon.json(`/api/auth/password-token?token=${encodeURIComponent(token)}`)
  check('token valid, email masked', tk.data.valid === true && tk.data.purpose === 'invite' && !tk.data.email.includes(email.split('@')[0]))
  const weak = await anon.json('/api/auth/password-token', { method: 'POST', body: { token, password: 'short' } })
  check('weak password refused', weak.status === 400)
  const setPw = await anon.json('/api/auth/password-token', { method: 'POST', body: { token, password: 'Malveira-Rita-2026' } })
  check('password set; pending approval reported', setPw.status === 200 && setPw.data.canSignIn === false)
  const reuse = await anon.json('/api/auth/password-token', { method: 'POST', body: { token, password: 'Another-Pass-2026' } })
  check('link cannot be reused', reuse.status === 400)
  const pendingLogin = await login(email, 'Malveira-Rita-2026')
  check('pending account cannot sign in', !pendingLogin.ok)
  await admin.json(`/api/staff/${inv.data.user.id}`, { method: 'PUT', body: { action: 'approve' } })
  const rita = await login(email, 'Malveira-Rita-2026')
  check('approved staff signs in with own password', rita.ok)
  const ritaStatus = await rita.s.json('/api/settings/status')
  check('non-admin cannot read system status (403)', ritaStatus.status === 403)
  const ritaPatch = await rita.s.json('/api/settings/clinic', { method: 'PATCH', body: { lunchBreak: { enabled: false, start: '12:30', end: '14:00' } } })
  check('non-admin cannot change clinic settings (403)', ritaPatch.status === 403)
  const wrongCurrent = await rita.s.json('/api/account/password', { method: 'POST', body: { currentPassword: 'nope', newPassword: 'Whatever-2026!' } })
  check('wrong current password → 400 (not 401)', wrongCurrent.status === 400)
  const reset = await anon.json('/api/auth/password-reset', { method: 'POST', body: { email } })
  const resetUnknown = await anon.json('/api/auth/password-reset', { method: 'POST', body: { email: 'nobody@nowhere.pt' } })
  check('forgot-password answers identically for known/unknown', reset.status === 200 && JSON.stringify(reset.data) === JSON.stringify(resetUnknown.data))
  const resetLink = await admin.json(`/api/staff/${inv.data.user.id}`, { method: 'PUT', body: { action: 'reset_password' } })
  check('admin reset issues a one-time link, not a default password', /\/login\?token=/.test(resetLink.data.resetUrl ?? ''))

  console.log('\n[10] GDPR export and erasure')
  await db.query("insert into sms_opt_outs (id, patient_id, phone_number, is_opted_out, opted_out_at) values ('itest-optout', $1, '+351912999888', true, now())", [p2.id])
  const exp = await admin.req(`/api/patients/${p2.id}/export`)
  const expJson = JSON.parse(await exp.text())
  check('export downloads JSON attachment', exp.status === 200 && (exp.headers.get('content-disposition') ?? '').includes('attachment') && expJson.patient?.id === p2.id)
  check('export never includes recording URLs', !JSON.stringify(expJson).includes('recordingUrl'))
  const wrongName = await admin.json(`/api/patients/${p2.id}/erase`, { method: 'POST', body: { confirmName: 'Someone Else', reason: 'Pedido do titular dos dados por email' } })
  check('erase refuses a wrong confirmation name', wrongName.status === 400)
  const erased = await admin.json(`/api/patients/${p2.id}/erase`, { method: 'POST', body: { confirmName: `${p2.first_name} ${p2.last_name}`, reason: 'Pedido do titular dos dados por email' } })
  check('erase succeeds', erased.status === 200 && erased.data.ok === true, JSON.stringify(erased.data))
  const gone = await admin.json(`/api/patients/${p2.id}`)
  check('erased patient returns 404', gone.status === 404)
  const left = await db.query("select patient_id from sms_opt_outs where id='itest-optout'")
  check('SMS opt-out survives erasure (patient_id NULL)', left.rows.length === 1 && left.rows[0].patient_id === null)
  const orphanCalls = await db.query('select count(*)::int as n from appointments where patient_id=$1', [p2.id])
  check('no appointments left for erased patient', orphanCalls.rows[0].n === 0)
  const tomb = await db.query("select count(*)::int as n from audit_logs where entity='patient' and entity_id=$1 and action='DELETE'", [p2.id])
  check('erasure tombstone in audit log', tomb.rows[0].n === 1)
  const readAudit = await db.query("select count(*)::int as n from audit_logs where entity='patient' and action='READ'")
  check('patient reads are audited', readAudit.rows[0].n >= 1)

  console.log('\n[11] Status, usage, audit export, knowledge')
  const st = await admin.json('/api/settings/status')
  const ids = Object.fromEntries((st.data.checks ?? []).map((c) => [c.id, c.status]))
  check('status: webhook secret ok', ids.vapi_secret === 'ok')
  check('status: no background-worker check; reminders off until cutover (info)', ids.worker === undefined && ids.reminders === 'info', JSON.stringify({ worker: ids.worker, reminders: ids.reminders }))
  check('status: real integrations list', Array.isArray(st.data.integrations) && st.data.integrations.some((i) => i.name === 'Vapi' && i.connected === true))
  const usage = await admin.json('/api/settings/usage')
  check('usage counts real calls', usage.status === 200 && usage.data.calls >= 1 && usage.data.appointmentsBookedByVoice >= 1, JSON.stringify(usage.data))
  const csv = await admin.req('/api/audit-logs?format=csv')
  const csvText = await csv.text()
  check('audit CSV export', csv.status === 200 && (csv.headers.get('content-type') ?? '').includes('text/csv') && csvText.startsWith('timestamp,action'))
  const kb = await admin.json('/api/knowledge', { method: 'POST', body: { action: 'import_defaults' } })
  check('FAQ import is idempotent (already seeded)', kb.status === 201 && kb.data.imported === 0)

  console.log('\n[12] Pages render for a signed-in admin')
  for (const p of ['/settings', '/callbacks', '/call-logs', '/dashboard', `/patients/${p1.id}`]) {
    const res = await admin.req(p)
    check(`${p} renders (200)`, res.status === 200, String(res.status))
  }
  const loginPage = await anon.req('/login?token=abc')
  check('/login?token= is reachable without a session', loginPage.status === 200)

  console.log('\n[13] Removed features stay removed')
  for (const p of ['/messaging', '/intake-forms', '/chat-logs', '/email/campaigns', '/portal']) {
    const res = await admin.req(p)
    check(`${p} is gone (404)`, res.status === 404, String(res.status))
  }
  const portalApi = await anon.req('/api/portal/session')
  check('former portal API is not public any more', [302, 303, 307].includes(portalApi.status), String(portalApi.status))
  const assignees = await admin.json('/api/callbacks/assignees')
  check('callback assignees list', assignees.status === 200 && Array.isArray(assignees.data.data) && assignees.data.data.length >= 1, String(assignees.status))


  console.log('\n[13b] Agenda, reminders outbox, patient link, Zappy import')
  {
    const { createHmac } = require('node:crypto')
    const { spawnSync } = require('node:child_process')
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    const APP = path.dirname(process.argv[3])
    const linkToken = (id) => {
      const mac = createHmac('sha256', 'itest-nextauth-secret-0123456789-abcdefghij').update(`appointment-link:${id}`).digest()
      const B = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      let t = ''
      for (let i = 0; i < 12; i++) t += B[mac[i] % 62]
      return t
    }
    const other = (await db.query("select id, first_name, last_name from patients where status='ACTIVE' and id <> $1 order by created_at limit 1", [p1.id])).rows[0]
    const aday = nextWeekday(5)

    const ag = await admin.json(`/api/agenda?from=${day}&to=${day}`)
    const voiceAppt = ag.data.appointments?.find((a) => a.patientId === p1.id && a.bookedVia === 'VOICE_AGENT')
    check('agenda lists the voice booking at its rescheduled time with the dentist id', voiceAppt?.start === `${day}T11:00` && voiceAppt?.providerId === 'ana-nunes', JSON.stringify(voiceAppt))
    check('agenda returns dentists, types and hours', ag.data.providers?.[0]?.id === 'ana-nunes' && ag.data.appointmentTypes?.length > 5 && ag.data.businessHours?.length === 7)

    const c1 = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: p1.id, date: aday, time: '16:30', type: 'EVALUATION', notifyPatient: false } })
    check('desk books a free slot (201)', c1.status === 201 && !!c1.data.id, JSON.stringify(c1.data))
    const c2 = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: other.id, date: aday, time: '16:45', type: 'EVALUATION' } })
    check('desk cannot double-book the dentist (409 conflict)', c2.status === 409 && c2.data.reason === 'conflict', JSON.stringify(c2.data))
    const v1 = await tool(`${CALL}-agenda`, 'book_appointment', { full_name: `${other.first_name} ${other.last_name}`, date_of_birth: (await db.query("select to_char(date_of_birth,'YYYY-MM-DD') as d from patients where id=$1", [other.id])).rows[0].d, date: aday, time: '16:30', appointment_type: 'EVALUATION' })
    check('Acácia sees the desk booking as taken (same engine)', /já está ocupado/.test(v1), v1)
    const late = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: other.id, date: aday, time: '18:30', type: 'EVALUATION', notifyPatient: false } })
    check('outside hours asks the desk to confirm (422)', late.status === 422 && late.data.issues?.some((i) => i.reason === 'outside_hours'), JSON.stringify(late.data))
    const lateOk = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: other.id, date: aday, time: '18:30', type: 'EVALUATION', notifyPatient: false, acknowledgeWarnings: true } })
    check('…and books once confirmed', lateOk.status === 201, JSON.stringify(lateOk.data))

    const mv = await admin.json(`/api/agenda/appointments/${c1.data.id}`, { method: 'PATCH', body: { action: 'move', date: aday, time: '17:00', notifyPatient: false } })
    check('move (drag & drop) succeeds', mv.status === 200, JSON.stringify(mv.data))
    await admin.json(`/api/agenda/appointments/${c1.data.id}`, { method: 'PATCH', body: { action: 'checkin', arrived: true } })
    const det = await admin.json(`/api/agenda/appointments/${c1.data.id}`)
    check('drawer history shows booked → moved → arrived', ['CREATED', 'RESCHEDULED', 'CHECKED_IN'].every((k) => det.data.events?.some((e) => e.kind === k)), JSON.stringify(det.data.events?.map((e) => e.kind)))

    const blk = await admin.json('/api/agenda/blocks', { method: 'POST', body: { providerId: 'ana-nunes', date: aday, start: '09:30', end: '10:30', kind: 'MEETING', reason: 'Formação' } })
    check('block time created', blk.status === 201 && blk.data.created === 1, JSON.stringify(blk.data))
    const availB = await tool(`${CALL}-agenda`, 'check_availability', { date: aday, appointment_type: 'EVALUATION' })
    const offered = availB.split('): ')[1] ?? ''
    check('Acácia does not offer blocked time', /Horários livres/.test(availB) && !/(09:30|10:00)/.test(offered) && /10:30/.test(offered), availB)
    const fs1 = await admin.json(`/api/agenda/free-slots?type=HYGIENE&from=${aday}&limit=3`)
    check('next free slots for a type', fs1.status === 200 && fs1.data.slots?.length === 3, JSON.stringify(fs1.data))
    const pulse = await admin.json(`/api/agenda/pulse?since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`)
    check('pulse reports recent voice-agent activity', pulse.status === 200 && pulse.data.changed === true && pulse.data.events?.length >= 1, JSON.stringify(pulse.data).slice(0, 200))
    const search = await admin.json(`/api/agenda/patients?q=${encodeURIComponent(`${p1.first_name} ${p1.last_name}`)}`)
    check('full-name patient search', search.data.patients?.some((p) => p.id === p1.id), JSON.stringify(search.data).slice(0, 200))

    // Patient link
    const token = linkToken(c1.data.id)
    const page = await anon.req(`/c/${token}`)
    const html = await page.text()
    check('patient link page opens without login', page.status === 200 && html.includes('A sua consulta'), String(page.status))
    check('patient page shows no treatment type', !/Consulta de avaliação/.test(html))
    const bogus = await anon.req('/c/AAAAAAAAAAAA')
    check('unknown token → 404', bogus.status === 404, String(bogus.status))
    const conf = await anon.json(`/api/public/appointment/${token}`, { method: 'POST', body: { action: 'confirm' } })
    check('patient confirms by link', conf.status === 200 && conf.data.state === 'confirmed', JSON.stringify(conf.data))
    const row = (await db.query('select status, confirmed_via from appointments where id=$1', [c1.data.id])).rows[0]
    check('…stored as CONFIRMED via link', row.status === 'CONFIRMED' && row.confirmed_via === 'link', JSON.stringify(row))
    const ics = await anon.req(`/c/${token}/ics`)
    check('.ics download for any calendar', ics.status === 200 && (ics.headers.get('content-type') ?? '').includes('text/calendar') && (await ics.text()).includes('BEGIN:VEVENT'))

    // Dispatcher security + outbox
    const noAuth = await anon.json('/api/cron/dispatch')
    check('dispatcher refuses without the cron secret (401)', noAuth.status === 401, String(noAuth.status))
    const okRun = await anon.json('/api/cron/dispatch', { headers: { authorization: 'Bearer itest-cron-secret' } })
    check('dispatcher runs with the secret', okRun.status === 200 && okRun.data.ok === true, JSON.stringify(okRun.data))
    const on = await admin.json('/api/settings/agenda', { method: 'PATCH', body: { remindersEnabled: true } })
    check('switching reminders on plans reminders for upcoming appointments', on.status === 200 && on.data.flags.reminders === true && on.data.replanned?.messages >= 1, JSON.stringify(on.data.replanned))
    const planned = (await db.query("select count(*)::int as n from appointment_notifications where status='PENDING' and kind='REMINDER_DAY_BEFORE'")).rows[0].n
    check('day-before reminders are in the outbox', planned >= 1, String(planned))
    const c3 = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: p1.id, date: aday, time: '14:00', type: 'EVALUATION' } })
    const conf3 = (await db.query("select count(*)::int as n from appointment_notifications where appointment_id=$1 and kind='CONFIRMATION'", [c3.data.id])).rows[0].n
    check('a new booking queues its confirmation in the same transaction', c3.status === 201 && conf3 >= 1, `${c3.status} ${conf3}`)
    const mv3 = await admin.json(`/api/agenda/appointments/${c3.data.id}`, { method: 'PATCH', body: { action: 'move', date: aday, time: '15:30' } })
    const stale = (await db.query(`select count(*)::int as n from appointment_notifications n join appointments a on a.id = n.appointment_id
      where n.appointment_id=$1 and n.status in ('PENDING','SENDING') and n.dedupe_key not like '%' || to_char(a.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z'`, [c3.data.id])).rows[0].n
    check('moving cancels reminders for the old slot', mv3.status === 200 && stale === 0, `${mv3.status} ${stale}`)
    const off = await admin.json('/api/settings/agenda', { method: 'PATCH', body: { remindersEnabled: false } })
    const left = (await db.query("select count(*)::int as n from appointment_notifications where status='PENDING'")).rows[0].n
    check('switching reminders off cancels everything pending', off.status === 200 && left === 0, String(left))

    // Pages
    for (const p of ['/appointments?agenda=1', `/print/appointments/${c1.data.id}/certificate`, '/settings?tab=agenda']) {
      const res = await admin.req(p)
      check(`${p} renders (200)`, res.status === 200, String(res.status))
    }
    const legacy = await admin.req('/appointments')
    check('/appointments still serves the previous page while the new agenda is off', legacy.status === 200)

    // Zappy import: dry run writes nothing, commit imports, a second commit changes nothing
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zappy-'))
    const future = nextWeekday(9)
    const [fy, fm, fd] = future.split('-')
    // Zappy's real client export header (44 columns), ";"-separated as Excel saves it in Portugal.
    const ZH = 'nr;name;email;mobile;phone_main_note;phone_2;phone_2_note;online;gender;birth_month;birth_day;birth_year;vat_number;full_name;address;zipcode;city;segment_automatic;segment_manual;crm_source;crm_referral;crm_referral_client_name;obs_1;obs_2;obs_3;invoice_obs;crm_work;crm_next_step;crm_next_step_date;loyaltycard_won_label;loyaltycard_won_value;data_protection_type_appointments;data_protection_type_campaigns;data_protection_type_customer_records;data_protection_type_reminders_email;data_protection_type_reminders_sms;data_protection_type_share_photos;data_protection_type_share_photos_no_face;data_protection_type_survey;RGPD_updated_on;createdon;next_appointment_date;last_appointment_date'.split(';')
    const zrow = (v) => ZH.map((h) => v[h] ?? '').join(';')
    const nextDay = nextWeekday(12)
    fs.writeFileSync(path.join(dir, 'clientes.csv'), '﻿' + ZH.join(';') + '\r\n' + [
      zrow({ nr: '501', name: 'RITA FERREIRA', email: 'rita@example.pt', mobile: '912 333 444', gender: 'F', birth_month: '3', birth_day: '12', birth_year: '1985', vat_number: '123456789',
        segment_automatic: 'Cliente Ativo', segment_manual: 'PCTE ONCOLÓGICA. ALERGICA AO ACIDO CLAVULANICO|VIP', crm_source: 'Instagram', obs_1: 'Prefere manhãs',
        crm_next_step: 'Ligar para marcar destartarização', crm_next_step_date: nextDay, data_protection_type_campaigns: 'Não', data_protection_type_reminders_sms: '0',
        data_protection_type_reminders_email: '1', RGPD_updated_on: '2024-05-10', createdon: '2019-02-01', last_appointment_date: '2025-01-10' }),
      zrow({ nr: '502', name: 'Paulo Ramos', full_name: 'Paulo Jorge Ramos', phone_2: '933 222 111', phone_2_note: 'casa', birth_month: 'Maio', birth_day: '5',
        next_appointment_date: `${nextDay} 15:00`, createdon: '2021-06-01' }),
      zrow({ nr: '503', name: 'Sem Telefone', birth_month: '2', birth_day: '31', birth_year: '1990' }),
    ].join('\r\n') + '\r\n')
    fs.writeFileSync(path.join(dir, 'marcacoes.csv'), 'ID;Data;Hora Início;Hora Fim;Nº Cliente;Cliente;Serviço;Colaborador;Estado\r\n' +
      `9001;${fd}/${fm}/${fy};10:30;11:15;501;Rita Ferreira;Destartarização;Ana Nunes;Confirmada\r\n` +
      `9002;${fd}/${fm}/${fy};11:30;12:00;502;Paulo Ramos;Botox;;Aguarda confirmação\r\n` +
      '9003;10/01/2025;09:30;10:00;501;Rita Ferreira;Consulta de avaliação;Ana Nunes;Confirmada\r\n' +
      '9004;11/01/2025;09:30;10:00;502;Paulo Ramos;Consulta;Ana Nunes;Faltou\r\n')
    fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({ services: { 'Destartarização': 'HYGIENE', 'Consulta de avaliação': 'EVALUATION', Consulta: 'CONSULTATION' }, staff: { 'Ana Nunes': 'ana-nunes' }, defaultType: 'OTHER', defaultProviderId: null }))
    // Node runs tsx's CLI directly (no shell): the project path contains a space.
    const runImport = (extra) => spawnSync(process.execPath, [path.join(APP, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/import-zappy.ts', '--clients', path.join(dir, 'clientes.csv'), '--bookings', path.join(dir, 'marcacoes.csv'), '--map', path.join(dir, 'map.json'), '--report', path.join(dir, 'report.csv'), ...extra], {
      cwd: APP, env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres', DATABASE_POOL_MAX: '1', NEXTAUTH_SECRET: 'itest-nextauth-secret-0123456789-abcdefghij' }, encoding: 'utf-8',
    })
    const countZ = async () => (await db.query("select (select count(*)::int from patients where external_id like 'zappy:%') as p, (select count(*)::int from appointments where external_id like 'zappy:%') as a")).rows[0]
    const dry = runImport([])
    check('import dry run succeeds', dry.status === 0, (dry.stderr || dry.stdout).slice(-400))
    const afterDry = await countZ()
    check('dry run writes nothing', afterDry.p === 0 && afterDry.a === 0, JSON.stringify(afterDry))
    check('dry run lists the unknown service', /Botox/.test(dry.stdout))
    const commit = runImport(['--commit', '--create-next-from-clients'])
    check('import commit succeeds', commit.status === 0, (commit.stderr || commit.stdout).slice(-400))
    const afterCommit = await countZ()
    check('3 clients, 4 bookings + 1 appointment known only from the client record', afterCommit.p === 3 && afterCommit.a === 5, JSON.stringify(afterCommit))
    const rita = (await db.query("select id, phone, nif, to_char(date_of_birth,'YYYY-MM-DD') as dob, total_visits from patients where external_id='zappy:501'")).rows[0]
    check('client fields mapped (E.164 phone, valid NIF, DOB, visits recounted)', rita?.phone === '+351912333444' && rita.nif === '123456789' && rita.dob === '1985-03-12' && rita.total_visits === 1, JSON.stringify(rita))
    const bad = (await db.query("select date_of_birth from patients where external_id='zappy:503'")).rows[0]
    check('impossible DOB imported as missing, not invented', bad && bad.date_of_birth === null)
    const appts = (await db.query("select external_id, status, type, provider_id, booked_via from appointments where external_id like 'zappy:%' order by external_id")).rows
    const by = Object.fromEntries(appts.map((a) => [a.external_id, a]))
    check('future confirmed → CONFIRMED, HYGIENE, with Ana', by['zappy:9001']?.status === 'CONFIRMED' && by['zappy:9001'].type === 'HYGIENE' && by['zappy:9001'].provider_id === 'ana-nunes', JSON.stringify(by['zappy:9001']))
    check('unknown service → OTHER, no dentist', by['zappy:9002']?.type === 'OTHER' && by['zappy:9002'].provider_id === null, JSON.stringify(by['zappy:9002']))
    check('past confirmed → COMPLETED; "Faltou" → NO_SHOW', by['zappy:9003']?.status === 'COMPLETED' && by['zappy:9004']?.status === 'NO_SHOW')
    check('imported bookings marked IMPORT and never messaged', appts.every((a) => a.booked_via === 'IMPORT') && (await db.query("select count(*)::int as n from appointment_notifications n join appointments a on a.id=n.appointment_id where a.external_id like 'zappy:%'")).rows[0].n === 0)
    const again = runImport(['--commit', '--create-next-from-clients'])
    const afterAgain = await countZ()
    check('second import (cutover delta) creates no duplicates', again.status === 0 && afterAgain.p === 3 && afterAgain.a === 5, JSON.stringify(afterAgain))
    check('…and no duplicate notes or follow-ups', (await db.query("select (select count(*)::int from patient_notes where content like 'Importado do Zappy%') as n, (select count(*)::int from callback_requests where source='IMPORT') as c")).rows[0].n === 1)

    // Zappy-specific fields
    const rz = (await db.query("select id, tags, sms_reminders_enabled, email_reminders_enabled, consents, client_source, to_char(patient_since,'YYYY-MM-DD') as since, to_char(last_visit_at,'YYYY-MM-DD') as last from patients where external_id='zappy:501'")).rows[0]
    check('segments → tags', JSON.stringify(rz.tags) === JSON.stringify(['PCTE ONCOLÓGICA. ALERGICA AO ACIDO CLAVULANICO', 'VIP']), JSON.stringify(rz.tags))
    check('SMS consent "0" → SMS reminders off; email stays on', rz.sms_reminders_enabled === false && rz.email_reminders_enabled === true)
    check('consents stored with their date', rz.consents?.campaigns === false && rz.consents?.updatedAt?.startsWith('2024-05-10'), JSON.stringify(rz.consents))
    check('origin, patient since and last visit kept', rz.client_source === 'Instagram' && rz.since === '2019-02-01' && rz.last === '2025-01-10', JSON.stringify(rz))
    const unsub = (await db.query('select count(*)::int as n from unsubscribes where patient_id=$1', [rz.id])).rows[0].n
    check('campaigns "Não" → unsubscribed from marketing', unsub === 1)
    const cbz = (await db.query("select reason, to_char(due_at,'YYYY-MM-DD') as due from callback_requests where source='IMPORT' and patient_id=$1", [rz.id])).rows[0]
    check('CRM next step → callback task with its date', cbz?.reason?.includes('Ligar para marcar') && cbz.due === nextDay, JSON.stringify(cbz))
    const pz = (await db.query("select phone, phone2, phone2_note, invoice_name, birth_day, birth_month, date_of_birth from patients where external_id='zappy:502'")).rows[0]
    check('only phone_2 → main phone; full_name → invoice name; birthday without year', pz.phone === '+351933222111' && pz.invoice_name === 'Paulo Jorge Ramos' && pz.birth_day === 5 && pz.birth_month === 5 && pz.date_of_birth === null, JSON.stringify(pz))
    const nextA = (await db.query("select start_time from appointments where external_id like 'zappy:next:%'")).rows
    check('next_appointment_date created as an appointment (flag on)', nextA.length === 1)

    // Agenda shows the clinical alert raised by the Zappy segment
    const agR = await admin.json(`/api/agenda?from=${future}&to=${future}`)
    const ritaAppt = agR.data.appointments?.find((a) => a.patientName.startsWith('Rita'))
    check('agenda card carries clinical alerts from segments', JSON.stringify(ritaAppt?.alerts?.clinical) === JSON.stringify(['Allergy', 'Oncology']), JSON.stringify(ritaAppt?.alerts))
    const detR = await admin.json(`/api/agenda/appointments/${ritaAppt?.id}`)
    check('drawer shows tags and the alert sources', detR.data.patient?.tags?.length === 2 && detR.data.patient?.alerts?.[0]?.source?.includes('ALERGICA'))

    // Agenda search + mini calendar
    const sr = await admin.json(`/api/agenda/patients?withAppointments=1&q=${encodeURIComponent('rita ferreira')}`)
    const hit = sr.data.patients?.[0]
    check('agenda search returns the patient with appointments to jump to', hit?.appointments?.some((a) => a.start.startsWith(future)) && hit.alerts.includes('Oncology'), JSON.stringify(hit).slice(0, 300))
    const sm = await admin.json(`/api/agenda/summary?from=${future}&to=${future}`)
    check('mini calendar counts per day', sm.status === 200 && sm.data.days?.[future]?.booked >= 2, JSON.stringify(sm.data))

    // Patient directory
    const dirAll = await admin.json('/api/patients/directory?q=ferreira')
    check('directory search by surname', dirAll.data.data?.some((p) => p.name === 'Rita Ferreira' && p.alerts.includes('Oncology') && p.nextAppointment), JSON.stringify(dirAll.data).slice(0, 300))
    const dirPhone = await admin.json('/api/patients/directory?q=933222111')
    check('directory search by second phone', dirPhone.data.data?.[0]?.name === 'Paulo Ramos', JSON.stringify(dirPhone.data.data?.map((p) => p.name)))
    const dirTag = await admin.json(`/api/patients/directory?tag=${encodeURIComponent('VIP')}`)
    check('directory tag filter', dirTag.data.data?.length === 1 && dirTag.data.data[0].name === 'Rita Ferreira')
    const dirNoDob = await admin.json('/api/patients/directory?missing=dob')
    check('directory "no date of birth" filter', dirNoDob.data.data?.some((p) => p.name === 'Paulo Ramos') && !dirNoDob.data.data?.some((p) => p.name === 'Rita Ferreira'))
    const summary = await admin.json('/api/patients/directory/summary')
    check('directory summary: counts and tags', summary.status === 200 && summary.data.counts.all >= 3 && summary.data.tags.some((t) => t.tag === 'VIP'), JSON.stringify(summary.data.counts))

    // Profile edits
    const badNif = await admin.json(`/api/patients/${rz.id}/profile`, { method: 'PATCH', body: { nif: '123456780' } })
    check('profile refuses an invalid NIF', badNif.status === 400, String(badNif.status))
    const prof = await admin.json(`/api/patients/${rz.id}/profile`, { method: 'PATCH', body: { tags: ['VIP', 'Ortodontia'], consents: { remindersSms: true } } })
    check('profile saves tags and turns SMS reminders back on via consent', prof.status === 200 && prof.data.smsRemindersEnabled === true && prof.data.tags.includes('Ortodontia'), JSON.stringify(prof.data).slice(0, 200))
    for (const pg of ['/patients', `/patients/${rz.id}`]) {
      const res = await admin.req(pg)
      check(`${pg} renders (200)`, res.status === 200, String(res.status))
    }

    // Upload from Patients → "Import from Zappy" (same code as the script, over HTTP)
    const upload = async (session, files, fields = {}) => {
      const fd = new FormData()
      for (const [k, v] of Object.entries(files)) fd.append(k, new Blob([v], { type: 'text/csv' }), `${k}.csv`)
      for (const [k, v] of Object.entries(fields)) fd.append(k, v)
      const res = await fetch(BASE + '/api/patients/import/zappy', { method: 'POST', body: fd, headers: session ? { cookie: session.header() } : {}, redirect: 'manual' })
      const text = await res.text()
      let data = null
      try { data = JSON.parse(text) } catch { data = text }
      return { status: res.status, data }
    }
    const upCsv = '﻿' + ZH.join(';') + '\r\n' + [
      zrow({ nr: '601', name: 'Helena Duarte', mobile: '961 000 111', vat_number: '123456780', segment_manual: 'Toma Xarelto' }),
      zrow({ nr: '602', name: 'Bruno Alves', mobile: '962 000 222', birth_day: '1', birth_month: '1', birth_year: '1980' }),
      zrow({ nr: '603' }),
    ].join('\r\n') + '\r\n'
    const anonUp = await upload(null, { clients: upCsv })
    check('upload refused without a staff session', [302, 303, 307, 401].includes(anonUp.status), String(anonUp.status))
    const prev = await upload(admin, { clients: upCsv })
    check('upload preview (200) counts new patients', prev.status === 200 && prev.data.counts?.['clients.created'] === 2 && prev.data.counts?.['clients.rejected'] === 1, JSON.stringify(prev.data?.counts ?? prev.data))
    check('preview lists the rows to look at (invalid NIF, no name)', prev.data.problemCount === 2 && prev.data.problems.some((r) => /invalid NIF/.test(r.detail)), JSON.stringify(prev.data.problems))
    const notYet = (await db.query("select count(*)::int as n from patients where external_id in ('zappy:601','zappy:602')")).rows[0].n
    check('preview writes nothing', notYet === 0, String(notYet))
    const imp = await upload(admin, { clients: upCsv }, { commit: '1' })
    check('upload import completes', imp.status === 200 && imp.data.complete === true && imp.data.counts['clients.created'] === 2, JSON.stringify(imp.data?.counts ?? imp.data))
    const helena = (await db.query("select nif, tags from patients where external_id='zappy:601'")).rows[0]
    check('uploaded patient stored (invalid NIF left empty, segment kept)', helena && helena.nif === null && helena.tags[0] === 'Toma Xarelto', JSON.stringify(helena))
    const again2 = await upload(admin, { clients: upCsv }, { commit: '1' })
    check('uploading the same file again changes nothing', again2.data.counts['clients.created'] === undefined && again2.data.counts['clients.unchanged'] === 2, JSON.stringify(again2.data.counts))
    const badMap = await upload(admin, { clients: upCsv }, { map: JSON.stringify({ staff: { X: 'no-such-dentist' } }) })
    check('a mapping to an unknown dentist is refused (400)', badMap.status === 400 && /unknown dentist/.test(badMap.data.error), JSON.stringify(badMap.data))
    const helenaDir = await admin.json('/api/patients/directory?q=helena')
    check('imported patient appears in the directory with her clinical alert', helenaDir.data.data?.[0]?.alerts?.includes('Anticoagulated'), JSON.stringify(helenaDir.data.data?.[0]))

    // Clients without a Zappy Nº: stable key, so re-uploads never duplicate them
    const noNr = '\uFEFF' + ZH.join(';') + '\r\n' + zrow({ name: 'Sofia Keyless', mobile: '965 000 333', createdon: '2022-05-06 11:30', obs_1: 'Nota única' }) + '\r\n'
    await upload(admin, { clients: noNr }, { commit: '1' })
    await upload(admin, { clients: noNr }, { commit: '1' })
    const sofia = (await db.query("select count(*)::int as n, min(external_id) as ext from patients where first_name='Sofia' and last_name='Keyless'")).rows[0]
    check('client without Nº uploaded twice → one record with a stable key', sofia.n === 1 && /^zappy:c:/.test(sofia.ext), JSON.stringify(sofia))
    const sofiaNotes = (await db.query("select count(*)::int as n from patient_notes n join patients p on p.id=n.patient_id where p.first_name='Sofia' and p.last_name='Keyless'")).rows[0].n
    check('…and its note is not duplicated', sofiaNotes === 1, String(sofiaNotes))
    // A record imported before keys existed (no external_id) is linked, not duplicated, and gets no second copy of its notes
    await db.query("insert into patients (id, first_name, last_name, patient_since, updated_at) values ('itest-legacy-keyless', 'Legacy', 'Keyless', '2021-03-04 10:00:00', now())")
    await db.query("insert into patient_notes (id, patient_id, author_id, content, note_type, updated_at) select 'itest-legacy-note', 'itest-legacy-keyless', id, 'Importado do Zappy: nota antiga', 'ADMINISTRATIVE', now() from users where role='ADMIN' limit 1")
    const legacyCsv = '\uFEFF' + ZH.join(';') + '\r\n' + zrow({ name: 'Legacy Keyless', mobile: '966 000 444', createdon: '2021-03-04 10:00', obs_1: 'nota antiga' }) + '\r\n'
    const legacyUp = await upload(admin, { clients: legacyCsv }, { commit: '1' })
    const legacyRec = (await db.query("select count(*)::int as n, max(external_id) as ext, max(phone) as phone from patients where first_name='Legacy' and last_name='Keyless'")).rows[0]
    check('keyless record from an earlier import is linked by name + Zappy creation date', legacyUp.data.counts?.['clients.updated'] === 1 && legacyRec.n === 1 && /^zappy:c:/.test(legacyRec.ext) && legacyRec.phone === '+351966000444', JSON.stringify({ counts: legacyUp.data.counts, legacyRec }))
    const legacyNotes = (await db.query("select count(*)::int as n from patient_notes where patient_id='itest-legacy-keyless'")).rows[0].n
    check('…without copying its notes again', legacyNotes === 1, String(legacyNotes))

    // Patient list views
    await db.query("insert into patients (id, first_name, last_name, phone, updated_at) values ('itest-no-surname', 'Adelino', '', '+351967000555', now())")
    const dupApi = await admin.json('/api/patients', { method: 'POST', body: { firstName: 'Rita', lastName: 'Ferreira Duplicada', phone: '912 333 444', dateOfBirth: '1985-03-12' } })
    const seen12 = await admin.json('/api/patients/directory?lifecycle=seen12&limit=100')
    check('"Seen in the last 12 months" view responds', seen12.status === 200 && Array.isArray(seen12.data.data), String(seen12.status))
    const nameCheck = await admin.json('/api/patients/directory?check=name&limit=100')
    check('"Names to check" lists a record without surname', nameCheck.data.data?.some((p) => p.id === 'itest-no-surname'), JSON.stringify(nameCheck.data.data?.map((p) => p.name)))
    const dups = await admin.json('/api/patients/directory?check=duplicates&limit=100')
    check('"Possible duplicates" pairs records sharing a phone', dupApi.status === 201 && dups.data.data?.filter((p) => (p.phone ?? '').replace(/[^0-9]/g, '').endsWith('912333444')).length >= 2, JSON.stringify(dups.data.data?.map((p) => [p.name, p.phone])))
    const sum2 = await admin.json('/api/patients/directory/summary')
    check('summary has counts for the new views', sum2.data.counts.seen12 >= 0 && sum2.data.counts.nameToCheck >= 1 && sum2.data.counts.possibleDuplicates >= 2, JSON.stringify(sum2.data.counts))

    // Notes are real now
    const noteAdd = await admin.json(`/api/patients/${rz.id}/notes`, { method: 'POST', body: { content: 'Prefere consultas ao fim do dia', noteType: 'GENERAL' } })
    check('add a note (201)', noteAdd.status === 201 && noteAdd.data.content === 'Prefere consultas ao fim do dia', JSON.stringify(noteAdd.data).slice(0, 200))
    const rec = await admin.json(`/api/patients/${rz.id}`)
    check('the record returns notes with their text', rec.data.notes?.some((n) => n.content === 'Prefere consultas ao fim do dia'))
    const emptyNote = await admin.json(`/api/patients/${rz.id}/notes`, { method: 'POST', body: { content: '   ' } })
    check('an empty note is refused (400)', emptyNote.status === 400)
    const noteDel = await admin.json(`/api/patients/${rz.id}/notes/${noteAdd.data.id}`, { method: 'DELETE' })
    check('delete a note', noteDel.status === 200 && !(await admin.json(`/api/patients/${rz.id}`)).data.notes?.some((n) => n.id === noteAdd.data.id))

    // Clearing a date of birth stores "unknown", never 1 Jan 1970
    const cleared = await admin.json(`/api/patients/${rz.id}`, { method: 'PUT', body: { dateOfBirth: null } })
    check('clearing the date of birth stores null (not 1970)', cleared.status === 200 && cleared.data.dateOfBirth === null, String(cleared.data?.dateOfBirth))
    await admin.json(`/api/patients/${rz.id}`, { method: 'PUT', body: { dateOfBirth: '1985-03-12' } })
    for (const pg of [`/patients/${rz.id}?tab=details`, `/patients/${rz.id}?tab=notes`, '/patients?x=1']) {
      const res = await admin.req(pg)
      check(`${pg} renders (200)`, res.status === 200, String(res.status))
    }
    const ag2 = await admin.json(`/api/agenda?from=${future}&to=${future}`)
    check('imported bookings show in the agenda', ag2.data.appointments?.filter((a) => a.bookedVia === 'IMPORT').length === 2, String(ag2.data.appointments?.length))

    // Waiting list: a patient wants a sooner time; a cancellation frees one; the agenda offers it to them
    const wday = nextWeekday(12)
    const later = nextWeekday(19)
    const todayIso = new Date().toISOString().slice(0, 10)
    const cur = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: rz.id, date: later, time: '10:00', type: 'EVALUATION', notifyPatient: false, acknowledgeWarnings: true } })
    const wl1 = await admin.json('/api/agenda/waitlist', { method: 'POST', body: { patientId: rz.id, fromDate: todayIso, timeOfDay: 'MORNING', currentAppointmentId: cur.data.id, notes: 'Pode vir em cima da hora' } })
    check('add to the waiting list (201)', cur.status === 201 && wl1.status === 201 && wl1.data.created === true, JSON.stringify({ cur: cur.status, wl: wl1.data }).slice(0, 200))
    const wl2 = await admin.json('/api/agenda/waitlist', { method: 'POST', body: { patientId: rz.id, fromDate: todayIso, timeOfDay: 'MORNING', currentAppointmentId: cur.data.id } })
    check('…adding again updates the same entry (one per patient)', wl2.status === 200 && wl2.data.id === wl1.data.id && wl2.data.created === false)
    const wlBad = await admin.json('/api/agenda/waitlist', { method: 'POST', body: { patientId: other.id, fromDate: todayIso, currentAppointmentId: cur.data.id } })
    check("…refuses another patient's appointment (400)", wlBad.status === 400)
    const freed = await admin.json('/api/agenda/appointments', { method: 'POST', body: { patientId: other.id, date: wday, time: '11:00', type: 'EVALUATION', notifyPatient: false, acknowledgeWarnings: true } })
    await admin.json(`/api/agenda/appointments/${freed.data.id}`, { method: 'PATCH', body: { action: 'status', status: 'CANCELLED', notifyPatient: false } })
    const fitAm = await admin.json(`/api/agenda/waitlist?date=${wday}&time=11:00&duration=30`)
    check('a freed morning time lists the waiting patient', fitAm.status === 200 && fitAm.data.entries?.some((e) => e.id === wl1.data.id && e.currentStart === `${later}T10:00`), JSON.stringify(fitAm.data).slice(0, 300))
    const fitPm = await admin.json(`/api/agenda/waitlist?date=${wday}&time=15:00&duration=30`)
    check('…but not an afternoon one (they asked for mornings)', !fitPm.data.entries?.some((e) => e.id === wl1.data.id))
    const fitLater = await admin.json(`/api/agenda/waitlist?date=${nextWeekday(28)}&time=09:00&duration=30`)
    check('…nor a time later than the one they already have', !fitLater.data.entries?.some((e) => e.id === wl1.data.id))
    const snap = await admin.json(`/api/agenda/patients/${rz.id}`)
    check('booking snapshot shows alerts, what is booked and the waiting list', snap.status === 200 && Array.isArray(snap.data.alerts) && snap.data.upcoming?.some((u) => u.id === cur.data.id) && snap.data.waitlist?.id === wl1.data.id && Array.isArray(snap.data.notes), JSON.stringify(snap.data).slice(0, 300))
    const take = await admin.json(`/api/agenda/appointments/${cur.data.id}`, { method: 'PATCH', body: { action: 'move', date: wday, time: '11:00', notifyPatient: false, acknowledgeWarnings: true, waitlistEntryId: wl1.data.id } })
    const wlRow = (await db.query('select status, booked_appointment_id from waitlist_entries where id=$1', [wl1.data.id])).rows[0]
    check('booking the freed time from the waiting list moves their appointment and closes the entry', take.status === 200 && wlRow?.status === 'BOOKED' && wlRow?.booked_appointment_id === cur.data.id, JSON.stringify({ take: take.data, wlRow }))
    const wlAfter = await admin.json('/api/agenda/waitlist')
    check('…and they leave the waiting list', wlAfter.status === 200 && !wlAfter.data.entries?.some((e) => e.id === wl1.data.id))

    // Check-up calls: logging the call takes the patient off the list for a while and notes it
    await db.query("update patients set last_visit_at = now() - interval '2 years' where id=$1", [other.id])
    await db.query("update appointments set status='CANCELLED' where patient_id=$1 and start_time > now() and status in ('SCHEDULED','CONFIRMED')", [other.id])
    const due1 = await admin.json('/api/patients/directory?recall=1&limit=100')
    check('a patient last seen 2 years ago with nothing booked is due a check-up', due1.data.data?.some((p) => p.id === other.id))
    const badCall = await admin.json(`/api/patients/${other.id}/recall`, { method: 'POST', body: { outcome: 'maybe' } })
    check('an unknown call outcome is refused (400)', badCall.status === 400)
    const logged = await admin.json(`/api/patients/${other.id}/recall`, { method: 'POST', body: { outcome: 'no_answer' } })
    const due2 = await admin.json('/api/patients/directory?recall=1&limit=100')
    const callNote = (await db.query("select count(*)::int as n from patient_notes where patient_id=$1 and note_type='FOLLOW_UP' and content like 'Check-up call: no answer%'", [other.id])).rows[0].n
    check('logging "no answer" hides them for a week and notes it on the record', logged.status === 200 && !due2.data.data?.some((p) => p.id === other.id) && callNote === 1, JSON.stringify({ logged: logged.data, callNote }))
    // Zappy reports → MARKINGS export (real header; 3 months per file, several files in one upload)
    {
      const MH = ['date', 'status', 'client_name', 'client_internal_nr', 'item_name', 'online', 'category', 'service_provider', 'price_base', 'discount', 'price_final', 'payment_date', 'cupao_id', 'updated_on', 'notes', 'Obs.3', 'cancel_reason']
      const mrow = (v) => MH.map((h) => v[h] ?? '').join('\t')
      const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const en = (iso, t) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)} ${t}`
      const us = (iso, t) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)} ${t}`
      const f1 = nextWeekday(30)
      const f2 = nextWeekday(33)
      const f3 = '2027-03-25'
      const helenaRow = { date: en(f1, '10:00 AM'), status: 'Confirmed', client_name: 'Helena Duarte', client_internal_nr: '601', item_name: 'A1.01.01.02: Dental consultation', online: '0', category: 'Consultation', service_provider: 'ANA NUNES', notes: 'Traz exames' }
      const fileA = [MH.join('\t'),
        mrow({ ...helenaRow, status: 'Cancelled', notes: '' }), // cancelled, then rebooked in the same slot
        mrow(helenaRow),
        mrow({ date: en('2026-03-10', '5:00 PM'), status: 'Missing (unpaid bookings)', client_name: 'Rita Ferreira', client_internal_nr: '501', item_name: 'Device Control', category: 'Orthodontics', service_provider: 'TELMO - TRAINING' }),
        mrow({ date: en(f1, '1:00 PM'), status: 'Personal time', client_name: '', service_provider: 'ANA NUNES' }),
        mrow({ date: en(f1, '12:00 PM'), status: 'Confirmed', client_name: 'ALERTS MATERIAL AND LABORATORY WORK', client_internal_nr: '9001', item_name: 'Device Control', service_provider: 'ALERTS', notes: 'JACINTO REGO' }),
        mrow({ date: en(f2, '9:00 AM'), status: 'Appointments on a waiting list', client_name: 'Rita Ferreira', client_internal_nr: '501', item_name: 'Device Control', category: 'Orthodontics', service_provider: 'ANA NUNES' }),
      ].join('\r\n') + '\r\n'
      // Second export overlaps the first (same Helena booking) and writes US dates
      const fileB = [MH.join('\t'),
        mrow({ ...helenaRow, date: us(f1, '10:00 AM') }),
        mrow({ date: us(f3, '4:30 PM'), status: 'Awaiting customer confirmation', client_name: 'Helena Duarte', client_internal_nr: '601', item_name: 'First consultation', category: 'Generic', service_provider: 'ANA NUNES' }),
      ].join('\r\n') + '\r\n'
      const markUp = async (commit) => {
        const fd = new FormData()
        fd.append('bookings', new Blob([fileA], { type: 'text/csv' }), 'zappy-q1.csv')
        fd.append('bookings', new Blob([fileB], { type: 'text/csv' }), 'zappy-q2.csv')
        fd.append('map', JSON.stringify({ services: {}, staff: { ALERTS: '__skip' }, defaultType: 'OTHER', defaultProviderId: null }))
        if (commit) fd.append('commit', '1')
        const res = await fetch(BASE + '/api/patients/import/zappy', { method: 'POST', body: fd, headers: { cookie: admin.header() }, redirect: 'manual' })
        return { status: res.status, data: await res.json().catch(() => null) }
      }
      const mp = await markUp(false)
      const c = mp.data?.counts ?? {}
      check('MARKINGS preview: 2 files, columns recognised, 3 bookings to create', mp.status === 200 && mp.data.bookings?.files === 2 && mp.data.bookings?.columns?.staff === 'service_provider' && c['bookings.created'] === 3, JSON.stringify({ status: mp.status, bookings: mp.data?.bookings, c }).slice(0, 400))
      check('…personal time, the ALERTS column, the overlapping row and the cancelled-then-rebooked copy are left out; the waiting list is recognised', c['bookings.personalTime'] === 1 && c['bookings.skippedStaff'] === 1 && c['bookings.duplicateRow'] === 2 && c['bookings.waitlist'] === 1, JSON.stringify(c))
      check('…guesses types and the dentist from the names', mp.data.unknownServices?.find((x) => x.name === 'A1.01.01.02: Dental consultation')?.guess === 'CONSULTATION' && mp.data.unknownStaff?.find((x) => x.name === 'ANA NUNES')?.guess === 'ana-nunes', JSON.stringify({ s: mp.data.unknownServices, st: mp.data.unknownStaff }).slice(0, 300))
      const mc = await markUp(true)
      const appts = (await db.query("select p.external_id as nr, a.status, a.type, a.provider_id, a.notes, to_char((a.start_time at time zone 'UTC') at time zone 'Europe/Lisbon','YYYY-MM-DD HH24:MI') as at from appointments a join patients p on p.id=a.patient_id where a.external_id like 'zappy:h:%' and p.external_id in ('zappy:601','zappy:501') order by a.start_time")).rows
      const conf = appts.find((a) => a.nr === 'zappy:601' && a.at === `${f1} 10:00`)
      const awaiting = appts.find((a) => a.nr === 'zappy:601' && a.at === `${f3} 16:30`)
      const missed = appts.find((a) => a.nr === 'zappy:501' && a.at === '2026-03-10 17:00')
      check('MARKINGS import: confirmed consultation with Ana Nunes at 10:00 (English date)', mc.status === 200 && mc.data.complete && conf?.status === 'CONFIRMED' && conf?.type === 'CONSULTATION' && conf?.provider_id === 'ana-nunes' && /Traz exames/.test(conf?.notes ?? ''), JSON.stringify({ mc: mc.data?.counts, appts }).slice(0, 500))
      check('…"Awaiting customer confirmation" (US date, 4:30 PM) is an unconfirmed booking', awaiting?.status === 'SCHEDULED' && awaiting?.type === 'EVALUATION', JSON.stringify(awaiting))
      check('…"Missing" is a no-show', missed?.status === 'NO_SHOW' && missed?.type === 'ORTHODONTICS' && missed?.provider_id === null, JSON.stringify(missed))
      const alertsPatient = (await db.query("select count(*)::int as n from patients where external_id='zappy:9001'")).rows[0].n
      const ritaWait = (await db.query("select w.status, w.notes from waitlist_entries w join patients p on p.id=w.patient_id where p.external_id='zappy:501' and w.notes like 'Lista de espera no Zappy%'")).rows
      check('…no patient is made from the ALERTS column; the waiting-list row joins the CRM waiting list', alertsPatient === 0 && ritaWait.length === 1 && ritaWait[0].status === 'ACTIVE', JSON.stringify({ alertsPatient, ritaWait }))
      // A booking without a client Nº whose name two patients share: one new record, never one per round
      await db.query("insert into patients (id, first_name, last_name, updated_at) values ('itest-joana-1', 'Joana', 'Lopes', now()), ('itest-joana-2', 'Joana', 'Lopes', now())")
      const joanaFile = [MH.join('\t'), mrow({ date: en(f2, '11:00 AM'), status: 'Confirmed', client_name: 'Joana Lopes', item_name: 'Primeira consulta', service_provider: 'ANA NUNES' }), mrow({ date: en('2026-02-03', '9:00 AM'), status: 'Pagou', client_name: 'Joana Lopes', item_name: 'Primeira consulta', service_provider: 'ANA NUNES' })].join('\r\n') + '\r\n'
      const joanaUp = async (commit) => {
        const fd = new FormData()
        fd.append('bookings', new Blob([joanaFile], { type: 'text/csv' }), 'zappy-joana.csv')
        fd.append('map', JSON.stringify({ services: {}, staff: {}, defaultType: 'OTHER', defaultProviderId: null }))
        if (commit) fd.append('commit', '1')
        const res = await fetch(BASE + '/api/patients/import/zappy', { method: 'POST', body: fd, headers: { cookie: admin.header() }, redirect: 'manual' })
        return { status: res.status, data: await res.json().catch(() => null) }
      }
      const jp = await joanaUp(false)
      check('a shared name without client Nº is flagged in the preview', jp.data?.counts?.['clients.ambiguousName'] === 1 && jp.data?.problems?.some((x) => /2 patients are called/.test(x.detail)), JSON.stringify(jp.data?.counts))
      await joanaUp(true)
      await joanaUp(true)
      await joanaUp(true)
      const joanas = (await db.query("select count(*)::int as n, count(*) filter (where external_id like 'zappy:n:%')::int as keyed from patients where first_name='Joana' and last_name='Lopes'")).rows[0]
      const joanaAppts = (await db.query("select count(*)::int as n from appointments a join patients p on p.id=a.patient_id where p.first_name='Joana' and p.last_name='Lopes'")).rows[0].n
      check('…importing it three times makes one new record with its 2 bookings (not one per round)', joanas.n === 3 && joanas.keyed === 1 && joanaAppts === 2, JSON.stringify({ joanas, joanaAppts }))
      // Merge: the record made from the booking goes into the right Joana; nothing comes back on re-import
      {
        const { createHash } = require('node:crypto')
        const fold = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        const made = (await db.query("select id, external_id from patients where first_name='Joana' and last_name='Lopes' and external_id like 'zappy:n:%'")).rows[0]
        const bookingsList = await admin.json('/api/patients/directory?check=bookings&limit=100')
        check('"Made from a Zappy booking" lists the record to merge', bookingsList.data.data?.some((x) => x.id === made?.id), JSON.stringify(bookingsList.data.data?.map((x) => x.name)))
        const cands = await admin.json(`/api/patients/${made.id}/merge`)
        check('merge suggests both patients with the same name', ['itest-joana-1', 'itest-joana-2'].every((id) => cands.data.candidates?.some((c) => c.id === id && c.reasons.includes('same name'))), JSON.stringify(cands.data))
        await admin.json(`/api/patients/${made.id}/notes`, { method: 'POST', body: { content: 'Nota no registo da marcação' } })
        // The right Joana already has one of the two bookings: it must be kept once, not doubled
        const dupKey = 'zappy:h:' + createHash('sha1').update(`itest-joana-1|${f2}|11:00|${fold('Primeira consulta')}`).digest('hex').slice(0, 12)
        await db.query("insert into appointments (id, patient_id, start_time, end_time, duration, type, status, external_id, reason, updated_at) values ('itest-joana-dup', 'itest-joana-1', $1::timestamp, $1::timestamp + interval '30 minutes', 30, 'EVALUATION', 'CONFIRMED', $2, 'Primeira consulta', now())", [`${f2} 11:00`, dupKey])
        const self = await admin.json(`/api/patients/${made.id}/merge`, { method: 'POST', body: { intoId: made.id } })
        check('merging a record into itself is refused (400)', self.status === 400)
        const mg = await admin.json(`/api/patients/${made.id}/merge`, { method: 'POST', body: { intoId: 'itest-joana-1' } })
        check('merge moves the bookings, drops the one both had, and the note', mg.status === 200 && mg.data.appointments === 1 && mg.data.duplicateAppointmentsDropped === 1 && mg.data.notes === 1, JSON.stringify(mg.data))
        const after = (await db.query("select (select count(*)::int from patients where id=$1) gone, (select count(*)::int from appointments where patient_id='itest-joana-1') appts, (select count(*)::int from patient_notes where patient_id='itest-joana-1') notes, (select patient_id from patient_aliases where external_id=$2) alias", [made.id, made.external_id])).rows[0]
        check('…the extra record is gone; the kept one has 2 bookings, the notes and an alias', after.gone === 0 && after.appts === 2 && after.notes === 2 && after.alias === 'itest-joana-1', JSON.stringify(after))
        const reimp = await joanaUp(true)
        const joanasNow = (await db.query("select count(*)::int as n from patients where first_name='Joana' and last_name='Lopes'")).rows[0].n
        const joana1Appts = (await db.query("select count(*)::int as n from appointments where patient_id='itest-joana-1'")).rows[0].n
        check('re-importing after the merge creates nothing and finds the kept record', reimp.status === 200 && (reimp.data.counts['bookings.created'] ?? 0) === 0 && joanasNow === 2 && joana1Appts === 2, JSON.stringify({ c: reimp.data.counts, joanasNow, joana1Appts }))
        const viewerTry = await admin.json('/api/patients/itest-joana-2/merge', { method: 'POST', body: { intoId: 'itest-joana-1' } })
        check('admin can merge two plain records too', viewerTry.status === 200, JSON.stringify(viewerTry.data))
      }
      const again = await markUp(true)
      check('uploading the same MARKINGS files again changes nothing', again.status === 200 && (again.data.counts['bookings.created'] ?? 0) === 0 && (again.data.counts['bookings.updated'] ?? 0) === 0 && (await db.query("select count(*)::int as n from waitlist_entries w join patients p on p.id=w.patient_id where p.external_id='zappy:501' and w.notes like 'Lista de espera no Zappy%'")).rows[0].n === 1, JSON.stringify(again.data?.counts))
    }
    // Vapi assistant-request: the CRM decides who answers an inbound call
    {
      const ask = (secret) => vapi({ message: { type: 'assistant-request', call: { id: `ar-${Date.now()}`, customer: { number: '+351912000111' } } } }, secret)
      const unsigned = await ask('wrong-secret')
      check('assistant-request without the secret is refused', unsigned.status === 401)
      const none = await (await ask()).json()
      check('…nothing configured: a spoken apology instead of silence', typeof none.error === 'string' && none.error.length > 10, JSON.stringify(none))
      await db.query("update settings set vapi_assistant_id='saved-acacia-123', vapi_transient_enabled=false")
      const saved = await (await ask()).json()
      check('…switch off: the saved assistant answers (exactly today’s Acácia)', saved.assistantId === 'saved-acacia-123' && !saved.assistant, JSON.stringify(saved))
      await db.query(`update settings set vapi_transient_enabled=true, vapi_structured_output_id='so-123', vapi_assistant_snapshot='{"voice":{"provider":"11labs","voiceId":"voz-acacia"},"transcriber":{"provider":"deepgram","model":"nova-2","language":"pt-PT"},"model":{"provider":"openai","model":"gpt-4o"}}'`)
      const t0 = Date.now()
      const built = await (await ask()).json()
      const ms = Date.now() - t0
      const a = built.assistant ?? {}
      const tools = a.model?.tools ?? []
      const fn = tools.filter((t) => t.type === 'function')
      check('…switch on: a CRM-built assistant, well inside Vapi’s 7.5 s', !!a.firstMessage && ms < 3000, `${ms} ms`)
      check('…it greets with the clinic, says it is virtual and that the call may be recorded', /assistente virtual/.test(a.firstMessage) && /gravada/.test(a.firstMessage), a.firstMessage)
      check('…keeps the saved voice and transcriber', a.voice?.voiceId === 'voz-acacia' && a.transcriber?.language === 'pt-PT', JSON.stringify({ v: a.voice, t: a.transcriber }))
      check('…10 CRM tools signed with the webhook secret, plus transfer and end call', fn.length === 10 && fn.every((t) => t.server?.url?.endsWith('/api/webhooks/vapi') && t.server?.headers?.['x-vapi-secret'] === 'itest-vapi-secret') && tools.some((t) => t.type === 'transferCall') && tools.some((t) => t.type === 'endCall'), JSON.stringify(tools.map((t) => t.function?.name ?? t.type)))
      check('…structured output attached; no legacy analysis plan', a.artifactPlan?.structuredOutputIds?.[0] === 'so-123' && !a.analysisPlan, JSON.stringify(a.artifactPlan))
      const prompt = a.model?.messages?.[0]?.content ?? ''
      check('…the prompt carries live clinic data and no template tags', /Hoje é /.test(prompt) && /A clínica está (aberta|fechada)/.test(prompt) && !prompt.includes('{{'), prompt.slice(0, 200))
      const preview = await admin.json('/api/settings/vapi/assistant')
      check('admin preview shows the same assistant with the secret masked', preview.status === 200 && preview.data.tools?.length === 12 && !JSON.stringify(preview.data).includes('itest-vapi-secret'), JSON.stringify(preview.data?.tools))
      const vs = await admin.json('/api/settings/vapi')
      check('Vapi settings never return the key', vs.status === 200 && !('apiKey' in vs.data) && vs.data.transientEnabled === true && vs.data.webhookSecretSet === true, JSON.stringify(vs.data))
      const off = await admin.json('/api/settings/vapi', { method: 'PUT', body: { transientEnabled: false } })
      const after = await (await ask()).json()
      check('switching it off in Settings hands calls straight back to the saved assistant', off.status === 200 && after.assistantId === 'saved-acacia-123', JSON.stringify(after).slice(0, 120))
      // A Vapi structured output (new format) is read at the end of the call
      const soCall = `so-call-${Date.now()}`
      const eoc = await vapi({ message: { type: 'end-of-call-report', call: { id: soCall, type: 'inboundPhoneCall', customer: { number: '+351966111222' } }, endedReason: 'customer-ended-call', artifact: { transcript: 'AI: Olá\nUser: Quero falar com alguém', messages: [{ role: 'assistant', message: 'Olá' }, { role: 'user', message: 'Quero falar com alguém' }], structuredOutputs: { 'so-123': { name: 'acacia_call_result', result: { call_outcome: 'TRANSFERRED', caller_intent: 'ROUTING' } } } } } })
      const cl = (await db.query('select outcome::text as outcome, intent::text as intent from call_logs where vapi_call_id=$1', [soCall])).rows[0]
      check('end-of-call reads Vapi structured outputs', eoc.status === 201 && cl?.outcome === 'TRANSFERRED' && cl?.intent === 'ROUTING', JSON.stringify(cl))
    }
    const agendaPage = await admin.req('/appointments?agenda=1')
    check('/appointments?agenda=1 renders (200)', agendaPage.status === 200, String(agendaPage.status))
  }

  console.log('\n[14] Two-factor sign-in')
  const st0 = await admin.json('/api/account/2fa')
  check('2FA off by default', st0.status === 200 && st0.data.enabled === false)
  const setup = await admin.json('/api/account/2fa', { method: 'POST', body: { action: 'setup' } })
  check('setup returns a base32 secret + otpauth link', /^[A-Z2-7]{32}$/.test(setup.data.secret ?? '') && (setup.data.otpauthUri ?? '').startsWith('otpauth://totp/'))
  const secret = setup.data.secret
  const wrong = await admin.json('/api/account/2fa', { method: 'POST', body: { action: 'enable', code: '000000' } })
  check('wrong code does not enable', wrong.status === 400)
  const en = await admin.json('/api/account/2fa', { method: 'POST', body: { action: 'enable', code: totpNow(secret) } })
  check('correct code enables 2FA', en.status === 200 && en.data.enabled === true, JSON.stringify(en.data))
  const lc = await anon.json('/api/auth/login-check', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } })
  check('login-check says a code is needed', lc.data.ok === true && lc.data.twoFactor === true)
  const lcBad = await anon.json('/api/auth/login-check', { method: 'POST', body: { email: ADMIN.email, password: 'wrong' } })
  check('login-check with wrong password reveals nothing', lcBad.data.ok === false && !('twoFactor' in lcBad.data))
  const noCode = await login(ADMIN.email, ADMIN.password)
  check('password alone no longer signs in', !noCode.ok)
  await new Promise((r) => setTimeout(r, 31_000)) // the enable code is spent; wait for the next 30 s step
  const code = totpNow(secret)
  const withCode = await login2fa(ADMIN.email, ADMIN.password, code)
  check('password + current code signs in', withCode.ok)
  const replay = await login2fa(ADMIN.email, ADMIN.password, code)
  check('the same code cannot be used twice', !replay.ok)

  console.log('\n[15] Required two-factor for administrators')
  const admin2fa = withCode.s
  const req2 = await admin2fa.json('/api/settings/security', { method: 'PATCH', body: { requireAdmin2fa: true } })
  check('policy saved', req2.status === 200 && req2.data.requireAdmin2fa === true)
  const other = await login('jonathan@kids0218.com', ADMIN.password)
  check('second admin (no 2FA) can still sign in', other.ok)
  await new Promise((r) => setTimeout(r, 61_000)) // policy cache is per instance, 60 s
  const gatedPage = await other.s.req('/dashboard')
  check('admin without 2FA is sent to /setup-2fa', [302, 303, 307].includes(gatedPage.status) && (gatedPage.headers.get('location') ?? '').includes('/setup-2fa'), `${gatedPage.status} ${gatedPage.headers.get('location')}`)
  const gatedApi = await other.s.json('/api/patients')
  check('…and blocked from APIs (403)', gatedApi.status === 403)
  const allowed = await other.s.json('/api/account/2fa')
  check('…but can reach the 2FA setup API', allowed.status === 200 && allowed.data.requiredByPolicy === true)
  const setupPage = await other.s.req('/setup-2fa')
  check('/setup-2fa renders', setupPage.status === 200)
  const cannotDisable = await admin2fa.json('/api/account/2fa', { method: 'POST', body: { action: 'disable', password: ADMIN.password, code: totpNow(secret) } })
  check('2FA cannot be turned off while required', cannotDisable.status === 403)
  await admin2fa.json('/api/settings/security', { method: 'PATCH', body: { requireAdmin2fa: false } })

  console.log('\n[16] Inactivity timeout (waits ~6 minutes)')
  await db.query('update settings set session_timeout = 5')
  await new Promise((r) => setTimeout(r, 61_000)) // let the 60 s policy cache expire
  const idle = await login('jonathan@kids0218.com', ADMIN.password)
  const active = await login('jonathan@kids0218.com', ADMIN.password)
  check('two fresh sessions', idle.ok && active.ok)
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 45_000))
    await active.s.req('/api/callbacks/new-count')
  }
  const idleRes = await idle.s.req('/api/callbacks/new-count')
  check('idle session signed out after the limit', [302, 303, 307].includes(idleRes.status) && (idleRes.headers.get('location') ?? '').includes('/login'), String(idleRes.status))
  const activeRes = await active.s.req('/api/callbacks/new-count')
  check('active session still signed in', activeRes.status === 200, String(activeRes.status))

  await db.end()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) {
    console.log('FAILURES:\n - ' + failures.join('\n - '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('E2E crashed:', e)
  process.exit(2)
})
