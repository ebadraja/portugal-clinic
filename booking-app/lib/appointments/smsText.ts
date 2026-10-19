// Pure SMS text helpers, import-free so the settings screen can preview templates in the browser.

// GSM 03.38 basic set + extension table (extension chars count double).
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXT = "^{}\\[~]|€"

/** Characters, encoding and number of SMS parts (what the carrier bills). */
export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; length: number; segments: number } {
  let gsm = true
  let units = 0
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1
    else if (GSM_EXT.includes(ch)) units += 2
    else {
      gsm = false
      break
    }
  }
  if (gsm) return { encoding: "GSM-7", length: units, segments: units <= 160 ? 1 : Math.ceil(units / 153) }
  const length = [...text].length
  return { encoding: "UCS-2", length, segments: length <= 70 ? 1 : Math.ceil(length / 67) }
}

/** "Clínica Dentária" → "Clinica Dentaria"; keeps the message in GSM-7 (160 chars per SMS). */
export function plainCharacters(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ºª]/g, (c) => (c === "º" ? "o" : "a"))
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
}

export const MERGE_TAGS = ["primeiro_nome", "data", "hora", "medico", "clinica", "telefone_clinica", "morada", "link"] as const
export type MergeTag = (typeof MERGE_TAGS)[number]

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}
