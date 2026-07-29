import prisma from '@/lib/prisma'
import { appendSystemMessage } from '@/lib/messaging/systemMessages'
import type { PracticeForm } from '@/lib/messaging/practiceForms'
import {
  getDefaultIntakeForm,
  parsePracticeForms,
  type PortalConfigWithForms,
} from '@/lib/messaging/practiceForms'

export async function loadPracticeFormsFromSettings(): Promise<{
  forms: PracticeForm[]
  defaultIntakeFormId: string | null
}> {
  const settings = await prisma.settings.findFirst({
    select: { portalConfig: true },
  })
  const portalConfig = (settings?.portalConfig ?? null) as PortalConfigWithForms | null
  return {
    forms: parsePracticeForms(portalConfig),
    defaultIntakeFormId: portalConfig?.defaultIntakeFormId ?? null,
  }
}

export async function appendPracticeFormLinkMessage(input: {
  patientId: string
  form: PracticeForm
  sentById?: string
  sentByName?: string
  automation?: boolean
  updatePreview?: boolean
}) {
  const { patientId, form, sentById, sentByName, automation, updatePreview = true } = input
  const content = `${form.name}\n${form.url}`

  return appendSystemMessage({
    patientId,
    content,
    contentType: 'FORM_LINK',
    metadata: {
      formId: form.id,
      formName: form.name,
      formDescription: form.description,
      formUrl: form.url,
      url: form.url,
      title: form.name,
      kind: 'hippatizer_form_link',
      ...(sentById ? { sentById, sentByName } : {}),
      ...(automation ? { automation: true } : {}),
    },
    updatePreview,
  })
}

export { getDefaultIntakeForm }
