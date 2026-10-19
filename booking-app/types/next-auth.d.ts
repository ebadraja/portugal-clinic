import type { Role } from "@/lib/generated/prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      firstName: string
      lastName: string
      jobTitle?: string
      avatar?: string
      twoFactorEnabled: boolean
      /** Clinic policy requires two-factor and this admin hasn't set it up yet. */
      mustEnroll2fa: boolean
      idleMinutes: number
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    firstName: string
    lastName: string
    jobTitle?: string
    avatar?: string
    twoFactorEnabled?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: Role
    firstName?: string
    lastName?: string
    jobTitle?: string
    avatar?: string
    twoFactorEnabled?: boolean
    mustEnroll2fa?: boolean
    idleMinutes?: number
    /** ms epoch of the last authenticated request (server-side idle timeout) */
    lastActivity?: number
  }
}
