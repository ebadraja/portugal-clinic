import { auth } from "@/auth"

/** Routes that must stay public (no staff session). */
function isPublicRoute(pathname: string): boolean {
  if (pathname.includes("/api/webhooks")) return true
  if (pathname.includes("/api/auth")) return true
  // Patient portal API (magic link, session, scoped messages) — M4
  if (pathname.startsWith("/api/portal")) return true
  // Website chat widget API
  if (pathname.startsWith("/api/webchat")) return true
  // Patient portal pages
  if (pathname.startsWith("/portal")) return true
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
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|public).*)",
  ],
}
