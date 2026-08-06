import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { z } from "zod"
import bcrypt from "bcryptjs"
import type { Role } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  // PrismaAdapter is included for future OAuth provider support.
  // With Credentials + JWT strategy, adapter methods are not invoked.
  // If OAuth providers are added later, add Account/Session/VerificationToken
  // models to prisma/schema.prisma and run `prisma db push`.
  adapter: PrismaAdapter(prisma as never),

  session: { strategy: "jwt" },

  pages: authConfig.pages,

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.isActive) return null
        if (user.approvalStatus !== 'APPROVED') return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

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
        }
      },
    }),
  ],

  callbacks: {
    authorized({ auth: session }) {
      return !!session?.user
    },

    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.jobTitle = user.jobTitle
        token.avatar = user.avatar
      }
      // Allow client-side update() calls to refresh mutable profile fields
      if (trigger === 'update' && session && typeof session === 'object') {
        if ('avatar' in session) token.avatar = (session as { avatar?: string }).avatar
      }
      return token
    },

    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as Role
      session.user.firstName = token.firstName as string
      session.user.lastName = token.lastName as string
      session.user.jobTitle = token.jobTitle as string | undefined
      session.user.avatar = token.avatar as string | undefined
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
