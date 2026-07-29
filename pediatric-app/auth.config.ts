import type { NextAuthConfig } from "next-auth"

// Edge-compatible config: no Prisma, no bcrypt.
// Used by middleware to validate sessions without a full Node.js runtime.
export const authConfig = {
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = nextUrl.pathname === "/login"
      const isOnRoot = nextUrl.pathname === "/"

      // Already logged in — send away from login / root to dashboard
      if ((isOnLogin || isOnRoot) && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }

      // Public routes — always allow
      if (isOnLogin) return true

      // Everything else — must be logged in
      return isLoggedIn
    },
  },
  providers: [],
} satisfies NextAuthConfig
