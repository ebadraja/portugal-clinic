import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { rankKnowledge } from '@/lib/voice/tools'
import { CLINIC_FAQ } from '@/lib/knowledge/defaults'

const best = (q: string) => rankKnowledge(q, CLINIC_FAQ)[0]?.category ?? null

describe('approved FAQ matching (website ↔ Acácia consistency)', () => {
  it.each([
    ['quanto custa a primeira consulta', 'Preços'],
    ['qual é o preço da avaliação', 'Preços'],
    ['aceitam seguros? tenho advancecare', 'Seguros'],
    ['qual é o vosso horário', 'Horário'],
    ['onde fica a clínica, qual a morada', 'Localização'],
    ['posso pagar em prestações', 'Pagamentos'],
    ['tenho uma urgência, dente partido', 'Urgências'],
    ['com quanta antecedência tenho de desmarcar', 'Políticas'],
    ['falam inglês', 'Línguas'],
    ['como posso marcar consulta', 'Marcações'],
  ])('“%s” → %s', (question, category) => {
    expect(best(question)).toBe(category)
  })

  it('returns nothing rather than a wrong answer for unrelated questions', () => {
    expect(rankKnowledge('quem ganhou o jogo de ontem', CLINIC_FAQ)).toEqual([])
    expect(rankKnowledge('ok', CLINIC_FAQ)).toEqual([])
  })

  it('the FAQ matches the confirmed clinic facts', () => {
    const text = CLINIC_FAQ.map((f) => f.answer).join(' ')
    expect(text).toMatch(/09:30 às 12:30 e das 14:00 às 18:00/)
    expect(text).toMatch(/45 €/)
    expect(text).toMatch(/Não aceitamos Cheque-Dentista/)
    expect(text).toMatch(/24 horas/)
  })
})
