import { auth } from "@/auth"

/** Routes that must stay public (no staff session). */
function isPublicRoute(pathname: string): boolean {
  if (pathname.includes("/api/webhooks")) return true
  if (pathname.includes("/api/auth")) return true
  // Appointment confirm/cancel link from reminders (/c/<token>, token-scoped) and its API
  if (pathname.startsWith("/c/")) return true
  if (pathname.startsWith("/api/public/appointment/")) return true
  // Reminder dispatcher — authorised by CRON_SECRET in the handler
  if (pathname === "/api/cron/dispatch") return true
  return false
}

export default auth(async (req) => {
  const session = req.auth
  const pathname = req.nextUrl.pathname

  if (isPublicRoute(pathname)) return

  const isLoggedIn = !!session?.user
  const isOnLogin = pathname === "/login"
  const isOnRoot = pathname === "/"

  // Already logged in — redirect away from login/root to dashboard
  if ((isOnLogin || isOnRoot) && isLoggedIn) {
    return Response.redirect(new URL("/dashboard", req.nextUrl))
  }

  // Public login route
  if (isOnLogin) return

  // Protected routes — must be logged in
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl))
  }

  // Clinic policy requires two-factor for admins: until it's set up, only the setup
  // page and its APIs are reachable (the jwt callback computes mustEnroll2fa).
  if (session?.user?.mustEnroll2fa) {
    const allowed = pathname === "/setup-2fa" || pathname.startsWith("/api/account/2fa")
    if (!allowed) {
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Set up two-factor sign-in first" }, { status: 403 })
      }
      return Response.redirect(new URL("/setup-2fa", req.nextUrl))
    }
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|public).*)",
  ],
}
