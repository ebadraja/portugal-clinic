import { describe, expect, it } from 'vitest'
import {
  getActivePracticeForms,
  getDefaultIntakeForm,
  normalizeFormUrl,
  parsePracticeForms,
  resolveFormLinkDisplay,
} from '@/lib/messaging/practiceForms'

describe('practiceForms', () => {
  it('normalizes URLs without protocol', () => {
    expect(normalizeFormUrl('hptz.io/abc')).toBe('https://hptz.io/abc')
  })

  it('parses practice forms from portal config', () => {
    const forms = parsePracticeForms({
      baseUrl: 'https://example.com/portal',
      practiceForms: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Intake',
          description: 'Before visit',
          url: 'https://hptz.io/abc',
          isActive: true,
        },
      ],
    })
    expect(forms).toHaveLength(1)
    expect(forms[0]?.name).toBe('Intake')
  })

  it('returns only active forms', () => {
    const active = getActivePracticeForms([
      {
        id: '1',
        name: 'A',
        description: '',
        url: 'https://hptz.io/a',
        isActive: true,
      },
      {
        id: '2',
        name: 'B',
        description: '',
        url: 'https://hptz.io/b',
        isActive: false,
      },
    ])
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe('1')
  })

  it('picks default intake form by id or first active', () => {
    const forms = [
      {
        id: 'first',
        name: 'First',
        description: '',
        url: 'https://hptz.io/1',
        isActive: true,
      },
      {
        id: 'second',
        name: 'Second',
        description: '',
        url: 'https://hptz.io/2',
        isActive: true,
      },
    ]
    expect(getDefaultIntakeForm(forms, 'second')?.id).toBe('second')
    expect(getDefaultIntakeForm(forms)?.id).toBe('first')
  })

  it('resolves modern form link metadata', () => {
    const resolved = resolveFormLinkDisplay({
      content: 'New Patient Intake Form\nhttps://hptz.io/abc',
      contentType: 'FORM_LINK',
      metadata: {
        formName: 'New Patient Intake Form',
        formDescription: 'Complete before visit',
        formUrl: 'https://hptz.io/abc',
        sentByName: 'Dr. Smith',
      },
    })
    expect(resolved?.formName).toBe('New Patient Intake Form')
    expect(resolved?.formDescription).toBe('Complete before visit')
    expect(resolved?.sentByName).toBe('Dr. Smith')
  })

  it('falls back for legacy form link content', () => {
    const resolved = resolveFormLinkDisplay({
      content: 'Patient Intake Form\nhttps://hptz.io/legacy',
      contentType: 'FORM_LINK',
      metadata: null,
    })
    expect(resolved?.formName).toBe('Patient Intake Form')
    expect(resolved?.formUrl).toBe('https://hptz.io/legacy')
  })
})
