import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { z } from "zod"
import bcrypt from "bcryptjs"
import type { Role } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"
import { consumeTotpCode } from "@/lib/auth/twoFactor"
import { SESSION_MAX_AGE_SECONDS, getSessionPolicy, isIdleExpired, mustEnrollTwoFactor } from "@/lib/auth/sessionPolicy"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(5),
  // Two-factor code — required only for accounts that have two-factor enabled
  code: z.string().max(10).optional(),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  // PrismaAdapter is included for future OAuth provider support.
  // With Credentials + JWT strategy, adapter methods are not invoked.
  // If OAuth providers are added later, add Account/Session/VerificationToken
  // models to prisma/schema.prisma and run `prisma db push`.
  adapter: PrismaAdapter(prisma as never),

  // Absolute limit of 12 h per sign-in; the inactivity limit (Settings → Security) is
  // enforced in the jwt callback below and in the browser (components/auth/idle-logout.tsx).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },

  pages: authConfig.pages,

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Two-factor code", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password, code } = parsed.data
        const normalizedEmail = email.trim().toLowerCase()

        const user = await prisma.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        })
        if (!user || !user.isActive) return null
        if (user.approvalStatus !== 'APPROVED') return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        // Two-factor: a valid, unused TOTP code is required when enabled on the account.
        if (user.twoFactorEnabled && !(await consumeTotpCode(user, code))) return null

        await Promise.all([
          prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
          prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "LOGIN",
              entity: "auth",
              timestamp: new Date(),
            },
          }),
        ])

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          jobTitle: user.jobTitle ?? undefined,
          avatar: user.avatar ?? undefined,
          twoFactorEnabled: user.twoFactorEnabled,
        }
      },
    }),
  ],

  callbacks: {
    authorized({ auth: session }) {
      return !!session?.user
    },

    async jwt({ token: rawToken, user, trigger, session }) {
      const token = rawToken as typeof rawToken & {
        id?: string
        role?: Role
        lastActivity?: number
        twoFactorEnabled?: boolean
        mustEnroll2fa?: boolean
        idleMinutes?: number
      }
      const now = Date.now()
      const policy = await getSessionPolicy(now)
      if (user) {
        token.id = user.id
        token.role = user.role
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.jobTitle = user.jobTitle
        token.avatar = user.avatar
        token.twoFactorEnabled = user.twoFactorEnabled ?? false
      } else if (isIdleExpired(token.lastActivity, policy.idleMinutes, now)) {
        // Inactive too long (closed tab, copied cookie): end the session.
        return null
      }
      token.lastActivity = now
      // Allow client-side update() calls to refresh mutable profile fields
      if (trigger === 'update' && session && typeof session === 'object') {
        if ('avatar' in session) token.avatar = (session as { avatar?: string }).avatar
        // Two-factor state is re-read from the database, never taken from the client.
        if ('refreshTwoFactor' in session && token.id) {
          const fresh = await prisma.user.findUnique({ where: { id: token.id }, select: { twoFactorEnabled: true } })
          token.twoFactorEnabled = fresh?.twoFactorEnabled ?? false
        }
      }
      token.idleMinutes = policy.idleMinutes
      token.mustEnroll2fa = mustEnrollTwoFactor(token.role, token.twoFactorEnabled, policy)
      return token
    },

    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as Role
      session.user.firstName = token.firstName as string
      session.user.lastName = token.lastName as string
      session.user.jobTitle = token.jobTitle as string | undefined
      session.user.avatar = token.avatar as string | undefined
      session.user.twoFactorEnabled = (token.twoFactorEnabled as boolean | undefined) ?? false
      session.user.mustEnroll2fa = (token.mustEnroll2fa as boolean | undefined) ?? false
      session.user.idleMinutes = (token.idleMinutes as number | undefined) ?? 30
      return session
    },
  },

  events: {
    async signOut(message) {
      if ("token" in message && message.token?.sub) {
        await prisma.auditLog.create({
          data: {
            userId: message.token.sub,
            action: "LOGOUT",
            entity: "auth",
            timestamp: new Date(),
          },
        })
      }
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
  trustHost: true,
})

export { authConfig }
