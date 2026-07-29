'use client'

import { useEffect, useRef } from 'react'

/** Target interval per REQUIREMENTS.md (< 2s web delivery). */
export const MESSAGING_POLL_MS = 2000

/**
 * Poll for new messages when Supabase Realtime is unavailable.
 * Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to enable
 * realtime subscriptions in a future upgrade; v1 uses polling per plan.
 */
export function useMessagingPoll(
  callback: () => void | Promise<void>,
  enabled = true,
  intervalMs = MESSAGING_POLL_MS,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      void callbackRef.current()
    }

    const intervalId = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(intervalId)
  }, [enabled, intervalMs])
}

export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(
    typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
