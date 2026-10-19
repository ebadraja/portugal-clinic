/**
 * First-time setup of an EMPTY production database (non-destructive).
 *
 *   DATABASE_URL=… NEXTAUTH_URL=https://<crm-domain> \
 *   BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_FIRST=Ana BOOTSTRAP_ADMIN_LAST=Nunes \
 *   npx tsx scripts/bootstrap-production.ts
 *
 * - Creates the Settings row with the clinic's confirmed defaults (if none exists).
 * - Imports the website FAQ into the Knowledge Base (if it is empty).
 * - Creates ONE approved admin with no usable password and prints a one-time
 *   set-password link (72 h). Refuses if any user already exists.
 * Never deletes or overwrites anything.
 */
import 'dotenv/config'
import prisma from '../lib/prisma'
import {
  DEFAULT_APPOINTMENT_TYPES,
  DEFAULT_BOOKING_POLICY,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_HOLIDAYS,
  DEFAULT_IDENTITY,
  DEFAULT_INSURERS,
  DEFAULT_LUNCH_BREAK,
  DEFAULT_PRACTICE,
  DEFAULT_PROVIDERS,
} from '../lib/clinic/settings'
import { CLINIC_FAQ } from '../lib/knowledge/defaults'
import { issuePasswordToken, unusablePasswordHash } from '../lib/auth/passwordTokens'

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase()
  const firstName = (process.env.BOOTSTRAP_ADMIN_FIRST ?? '').trim()
  const lastName = (process.env.BOOTSTRAP_ADMIN_LAST ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName || !lastName) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_FIRST and BOOTSTRAP_ADMIN_LAST.')
  }
  if (!process.env.NEXTAUTH_URL?.startsWith('https://')) throw new Error('Set NEXTAUTH_URL to the production https:// URL (used in the link).')

  const users = await prisma.user.count()
  if (users > 0) throw new Error(`Refusing: the database already has ${users} user(s). Invite people from Staff instead.`)

  if (!(await prisma.settings.findFirst({ select: { id: true } }))) {
    await prisma.settings.create({
      data: {
        practiceName: DEFAULT_PRACTICE.name,
        practiceTagline: DEFAULT_PRACTICE.tagline,
        practicePhone: DEFAULT_PRACTICE.phone,
        practiceEmail: DEFAULT_PRACTICE.email,
        practiceAddress: DEFAULT_PRACTICE.address,
        practiceWebsite: DEFAULT_PRACTICE.website,
        timezone: 'Europe/Lisbon',
        locale: 'pt-PT',
        businessHours: DEFAULT_BUSINESS_HOURS,
        lunchBreak: DEFAULT_LUNCH_BREAK,
        holidays: DEFAULT_HOLIDAYS,
        appointmentTypes: DEFAULT_APPOINTMENT_TYPES,
        bookingPolicy: DEFAULT_BOOKING_POLICY,
        providers: DEFAULT_PROVIDERS,
        insurers: DEFAULT_INSURERS,
        clinicIdentity: DEFAULT_IDENTITY,
        voiceAgentEnabled: true,
        voiceAgentName: 'Acácia',
        emergencyPhone: DEFAULT_PRACTICE.phone,
        notificationEmail: DEFAULT_PRACTICE.email,
      },
    })
    console.log('✓ Settings created with the clinic defaults')
  } else {
    console.log('• Settings already exist — left unchanged')
  }

  if ((await prisma.knowledgeItem.count()) === 0) {
    await prisma.knowledgeItem.createMany({ data: CLINIC_FAQ.map((f) => ({ ...f, isActive: true, sourceUrl: 'dental-website FAQ' })) })
    console.log(`✓ Knowledge Base: ${CLINIC_FAQ.length} approved answers imported`)
  }

  const admin = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      passwordHash: await unusablePasswordHash(),
      role: 'ADMIN',
      jobTitle: 'Administrator',
      isActive: true,
      approvalStatus: 'APPROVED',
    },
  })
  const { url, expiresAt } = await issuePasswordToken(admin.id, 'invite')
  await prisma.auditLog.create({ data: { userId: null, action: 'CREATE', entity: 'user', entityId: admin.id, changes: { bootstrap: true, role: 'ADMIN' }, timestamp: new Date() } })
  console.log(`✓ Admin created: ${email}`)
  console.log(`SET_PASSWORD_LINK ${url}`)
  console.log(`(valid until ${expiresAt.toISOString()}, usable once)`)
}

main()
  .catch((e) => {
    console.error('✗', (e as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
