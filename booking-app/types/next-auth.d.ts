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
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    firstName: string
    lastName: string
    jobTitle?: string
    avatar?: string
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
  }
}
