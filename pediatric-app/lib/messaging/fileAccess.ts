export function authorizeFileAccess(input: {
  staffUserId: string | null | undefined
  portalPatientId: string | null | undefined
  conversationPatientId: string
}):
  | { ok: true; accessorType: 'staff' | 'patient'; accessorId: string }
  | { ok: false; status: 401 | 403 } {
  if (input.staffUserId) {
    return { ok: true, accessorType: 'staff', accessorId: input.staffUserId }
  }

  if (input.portalPatientId) {
    if (input.portalPatientId !== input.conversationPatientId) {
      return { ok: false, status: 403 }
    }
    return { ok: true, accessorType: 'patient', accessorId: input.portalPatientId }
  }

  return { ok: false, status: 401 }
}
