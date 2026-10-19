import { auth } from "@/auth"

/** Routes that must stay public (no staff session). */
function isPublicRoute(pathname: string): boolean {
  if (pathname.includes("/api/webhooks")) return true
  if (pathname.includes("/api/auth")) return true
  // Patient portal API (magic link, session, scoped messages) — M4
  if (pathname.startsWith("/api/portal")) return true
  // Website chat widget API
  if (pathname.startsWith("/api/webchat")) return true
  // Links inside patient emails (signed tokens) and the SendGrid event webhook (signature-verified)
  if (pathname === "/api/email/unsubscribe") return true
  if (pathname === "/api/email/view") return true
  if (pathname === "/api/email/webhook/sendgrid") return true
  // Patient portal pages
  if (pathname.startsWith("/portal")) return true
  // Appointment confirm/cancel link from reminders (/c/<token>, token-scoped) and its API
  if (pathname.startsWith("/c/")) return true
  if (pathname.startsWith("/api/public/appointment/")) return true
  // Reminder dispatcher — authorised by CRON_SECRET in the handler
  if (pathname === "/api/cron/dispatch") return true
  // Embeddable widget assets from /public
  if (
    /^\/(webchat-widget\.js|webchat-core\.js|webchat-test\.html)$/.test(pathname)
  ) {
    return true
  }
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
