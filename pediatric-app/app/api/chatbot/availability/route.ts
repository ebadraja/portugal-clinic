import { NextRequest } from "next/server"
import {
  addDaysToDateString,
  getDayAvailability,
} from "@/lib/appointments/availability"
import {
  chatbotJsonResponse,
  handleChatbotPreflight,
  rejectChatbotOrigin,
} from "@/lib/chatbot/cors"

export const dynamic = "force-dynamic"

// GET /api/chatbot/availability?date=YYYY-MM-DD&provider=...&range=7&duration=30
// Reuses getDayAvailability — same shape as /api/appointments/availability per day.

export async function OPTIONS(request: NextRequest) {
  return handleChatbotPreflight(request) ?? chatbotJsonResponse({}, request.headers.get("origin"), { status: 204 })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const preflight = handleChatbotPreflight(request)
  if (preflight) return preflight

  const originReject = rejectChatbotOrigin(origin)
  if (originReject) return originReject

  const { searchParams } = request.nextUrl
  const dateParam     = searchParams.get("date")
  const providerParam = searchParams.get("provider") ?? undefined
  const rawDuration   = parseInt(searchParams.get("duration") ?? "30", 10)
  const rawRange      = parseInt(searchParams.get("range") ?? "1", 10)
  const duration      = isNaN(rawDuration) || rawDuration <= 0 ? 30 : rawDuration
  const range         = isNaN(rawRange) || rawRange <= 0 ? 1 : Math.min(rawRange, 14)

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return chatbotJsonResponse(
      { error: "Missing or invalid 'date' parameter. Expected YYYY-MM-DD." },
      origin,
      { status: 400 }
    )
  }

  try {
    const days = []
    for (let i = 0; i < range; i++) {
      const dayDate = addDaysToDateString(dateParam, i)
      days.push(await getDayAvailability({
        date: dayDate,
        provider: providerParam,
        duration,
      }))
    }

    if (range === 1) {
      return chatbotJsonResponse(days[0], origin)
    }

    return chatbotJsonResponse({ days }, origin)
  } catch (error) {
    console.error("[GET /api/chatbot/availability]", error)
    return chatbotJsonResponse({ error: "Failed to fetch available slots" }, origin, { status: 500 })
  }
}
