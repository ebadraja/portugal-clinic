import { NextRequest, NextResponse } from "next/server"

const DEFAULT_ORIGINS = [
  "https://www.kids0218.com",
  "https://kids0218.com",
  "https://kids-0-to-18-integrative-pediatrics.webflow.io",
  "http://localhost:3000",
]

export function getChatbotAllowedOrigins(): string[] {
  const raw = process.env.CHATBOT_CORS_ORIGINS
  if (!raw?.trim()) return DEFAULT_ORIGINS
  return raw.split(",").map((o) => o.trim()).filter(Boolean)
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (getChatbotAllowedOrigins().includes(origin)) return true
  try {
    const host = new URL(origin).hostname
    if (host.endsWith(".webflow.io")) return true
  } catch {
    // ignore malformed origin
  }
  return false
}

export function chatbotCorsHeaders(
  origin: string | null,
  options?: { credentials?: boolean },
): Record<string, string> {
  if (!origin || !isOriginAllowed(origin)) {
    return {}
  }
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
  if (options?.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true"
  }
  return headers
}

export function withChatbotCors(
  response: NextResponse,
  origin: string | null,
  options?: { credentials?: boolean },
): NextResponse {
  const headers = chatbotCorsHeaders(origin, options)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}

export function chatbotJsonResponse(
  body: unknown,
  origin: string | null,
  init?: { status?: number },
  options?: { credentials?: boolean },
): NextResponse {
  return withChatbotCors(NextResponse.json(body, { status: init?.status ?? 200 }), origin, options)
}

export function handleChatbotPreflight(
  request: NextRequest,
  options?: { credentials?: boolean },
): NextResponse | null {
  if (request.method !== "OPTIONS") return null
  const origin = request.headers.get("origin")
  if (!isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 403 })
  }
  return withChatbotCors(new NextResponse(null, { status: 204 }), origin, options)
}

export function rejectChatbotOrigin(origin: string | null): NextResponse | null {
  if (!origin) return null
  if (isOriginAllowed(origin)) return null
  return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
}
