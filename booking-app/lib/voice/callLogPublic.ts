/**
 * Allowlist serialiser for call logs sent to the browser.
 *
 * The provider's recording URL is a bearer link to PHI audio: it must never
 * reach the client. Staff play recordings through
 * GET /api/call-logs/[id]/recording, which checks the session and audits the read.
 */
type WithRecording = { recordingUrl?: string | null }

export function toPublicCallLog<T extends WithRecording>(log: T): Omit<T, 'recordingUrl'> & { hasRecording: boolean } {
  const { recordingUrl, ...rest } = log
  return { ...rest, hasRecording: !!recordingUrl }
}

export function toPublicCallLogs<T extends WithRecording>(logs: T[]): (Omit<T, 'recordingUrl'> & { hasRecording: boolean })[] {
  return logs.map(toPublicCallLog)
}
