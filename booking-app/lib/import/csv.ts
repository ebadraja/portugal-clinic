/**
 * Small RFC 4180 CSV reader for one-off imports (Zappy exports).
 *
 * Handles what Excel in Portugal actually produces: ";" separators, a UTF-8 BOM or
 * Windows-1252 bytes, quoted fields with embedded separators/newlines, CRLF.
 */

/** UTF-8 if it decodes cleanly, otherwise Windows-1252 (Excel "CSV" on a PT Windows). */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
  return text.replace(/^﻿/, '')
}

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/))
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ','
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v.trim() !== '')) rows.push(row)
  return rows
}

/** Rows as objects keyed by the header row (trimmed). */
export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, records }
}
