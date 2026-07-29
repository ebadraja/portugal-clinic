'use client'

import { useEffect, useState } from 'react'
import { Inbox, ClipboardList, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSession } from 'next-auth/react'
import { REASON_OPTIONS } from '@/lib/messaging/settingsSchemas'
import type { PracticeForm } from '@/lib/messaging/practiceForms'
import { getActivePracticeForms, isValidFormUrl, normalizeFormUrl, parsePracticeForms } from '@/lib/messaging/practiceForms'
import {
  DEFAULT_FILE_SHARING_CONFIG,
  parseFileSharingConfig,
  type FileSharingConfig,
} from '@/lib/messaging/fileSharingConfig'
import { AUTOMATION_TRIGGER_LABELS } from '@/lib/messaging/schemas'
import type { AutomationRuleSummary, MessageTemplateSummary, SharedInboxSummary } from '@/types/messaging'

function formatDelayLabel(triggerEvent: string, delayMinutes: number): string {
  const hours = delayMinutes / 60
  const timing =
    hours >= 24 && hours % 24 === 0
      ? `${hours / 24} day${hours / 24 === 1 ? '' : 's'}`
      : hours >= 1
        ? `${hours} hour${hours === 1 ? '' : 's'}`
        : `${delayMinutes} min`

  if (triggerEvent === 'APPOINTMENT_REMINDER' || triggerEvent === 'INTAKE_FORM_DUE') {
    return `${timing} before`
  }
  if (triggerEvent === 'NO_SHOW' || triggerEvent === 'POST_VISIT') {
    return `${timing} after`
  }
  if (triggerEvent === 'NEW_PATIENT') {
    return 'On patient creation'
  }
  return timing
}

const labelCls = 'block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2'
const inputCls =
  'dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100'

const DEFAULT_HOURS = {
  monday: { open: '08:00', close: '17:00' },
  tuesday: { open: '08:00', close: '17:00' },
  wednesday: { open: '08:00', close: '17:00' },
  thursday: { open: '08:00', close: '17:00' },
  friday: { open: '08:00', close: '17:00' },
  saturday: { closed: true },
  sunday: { closed: true },
}

const DEFAULT_ROUTING: Record<string, string> = {
  SCHEDULING: 'Scheduling',
  REFILL: 'Refills',
  QUESTION: 'Clinical',
  URGENT: 'Clinical',
  INSURANCE: 'Billing',
  RECORDS: 'Billing',
  OTHER: 'Scheduling',
}

export function MessagingSettingsTab() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [messagingEnabled, setMessagingEnabled] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [offlineMessage, setOfflineMessage] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [portalBaseUrl, setPortalBaseUrl] = useState('')
  const [routingRules, setRoutingRules] = useState<Record<string, string>>(DEFAULT_ROUTING)

  const [smsProvider, setSmsProvider] = useState<string | null>(null)
  const [smsNumberMasked, setSmsNumberMasked] = useState<string | null>(null)
  const [sendNotificationOnStaffReply, setSendNotificationOnStaffReply] = useState(true)
  const [sendOtpCodes, setSendOtpCodes] = useState(true)

  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([])
  const [automationRules, setAutomationRules] = useState<AutomationRuleSummary[]>([])
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ delayMinutes: 0, templateBody: '' })
  const [inboxes, setInboxes] = useState<SharedInboxSummary[]>([])
  const [newTemplate, setNewTemplate] = useState({ name: '', category: 'General', body: '' })
  const [newInboxName, setNewInboxName] = useState('')
  const [practiceForms, setPracticeForms] = useState<PracticeForm[]>([])
  const [defaultIntakeFormId, setDefaultIntakeFormId] = useState('')
  const [editingFormId, setEditingFormId] = useState<string | null>(null)
  const [editFormDraft, setEditFormDraft] = useState<PracticeForm | null>(null)
  const [newForm, setNewForm] = useState({ name: '', description: '', url: '' })
  const [savingForms, setSavingForms] = useState(false)
  const [formsMessage, setFormsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fileSharing, setFileSharing] = useState<FileSharingConfig>(DEFAULT_FILE_SHARING_CONFIG)

  const load = async () => {
    setLoading(true)
    try {
      const [settingsRes, templatesRes, inboxesRes, rulesRes] = await Promise.all([
        fetch('/api/settings/messaging'),
        fetch('/api/messaging/templates'),
        fetch('/api/messaging/shared-inboxes'),
        fetch('/api/messaging/automation-rules'),
      ])

      if (settingsRes.ok) {
        const s = await settingsRes.json()
        setMessagingEnabled(s.messagingEnabled ?? false)
        const widget = (s.webChatWidgetConfig ?? {}) as Record<string, string>
        setWelcomeMessage(widget.welcomeMessage ?? '')
        setOfflineMessage(widget.offlineMessage ?? '')
        setPrimaryColor(widget.primaryColor ?? '#2563eb')
        const portal = (s.portalConfig ?? {}) as {
          baseUrl?: string
          defaultIntakeFormId?: string
        }
        setPortalBaseUrl(portal.baseUrl ?? '')
        setPracticeForms(parsePracticeForms(s.portalConfig))
        setFileSharing(parseFileSharingConfig(s.portalConfig))
        setDefaultIntakeFormId(portal.defaultIntakeFormId ?? '')
        setRoutingRules({ ...DEFAULT_ROUTING, ...(s.defaultRoutingRules ?? {}) })
        setSmsProvider(s.smsProvider ?? null)
        setSmsNumberMasked(s.smsNumberMasked ?? null)
        const smsCfg = (s.smsProviderConfig ?? {}) as {
          sendNotificationOnStaffReply?: boolean
          sendOtpCodes?: boolean
        }
        setSendNotificationOnStaffReply(smsCfg.sendNotificationOnStaffReply ?? true)
        setSendOtpCodes(smsCfg.sendOtpCodes ?? true)
      }

      if (templatesRes.ok) {
        const t = await templatesRes.json()
        setTemplates(t.data ?? [])
      }
      if (inboxesRes.ok) {
        const i = await inboxesRes.json()
        setInboxes(i.data ?? [])
      }
      if (rulesRes.ok) {
        const r = await rulesRes.json()
        setAutomationRules(r.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const buildPortalConfig = () => ({
    ...(portalBaseUrl ? { baseUrl: portalBaseUrl } : {}),
    practiceForms,
    ...(defaultIntakeFormId ? { defaultIntakeFormId } : {}),
    fileSharing,
  })

  const saveSettings = async () => {
    if (!isAdmin) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/messaging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messagingEnabled,
          messagingBusinessHours: DEFAULT_HOURS,
          defaultRoutingRules: routingRules,
          webChatWidgetConfig: {
            enabled: true,
            welcomeMessage,
            offlineMessage,
            primaryColor,
            position: 'bottom-right',
          },
          portalConfig: buildPortalConfig(),
          smsProviderConfig: {
            sendNotificationOnStaffReply,
            sendOtpCodes,
          },
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setMessage({ type: 'success', text: 'Messaging settings saved.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save messaging settings.' })
    } finally {
      setSaving(false)
    }
  }

  const createTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) return
    const res = await fetch('/api/messaging/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTemplate),
    })
    if (res.ok) {
      setNewTemplate({ name: '', category: 'General', body: '' })
      await load()
    }
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/messaging/templates/${id}`, { method: 'DELETE' })
    await load()
  }

  const createInbox = async () => {
    if (!isAdmin || !newInboxName.trim()) return
    const res = await fetch('/api/messaging/shared-inboxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newInboxName.trim() }),
    })
    if (res.ok) {
      setNewInboxName('')
      await load()
    }
  }

  const toggleSubscribe = async (inbox: SharedInboxSummary) => {
    const method = inbox.isSubscribed ? 'DELETE' : 'POST'
    await fetch(`/api/messaging/shared-inboxes/${inbox.id}/subscribe`, { method })
    await load()
  }

  const toggleRuleActive = async (rule: AutomationRuleSummary) => {
    await fetch(`/api/messaging/automation-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    await load()
  }

  const startEditRule = (rule: AutomationRuleSummary) => {
    setEditingRuleId(rule.id)
    setEditDraft({
      delayMinutes: rule.delayMinutes,
      templateBody: rule.template.body,
    })
  }

  const saveRuleEdit = async (ruleId: string) => {
    await fetch(`/api/messaging/automation-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    })
    setEditingRuleId(null)
    await load()
  }

  const deleteRule = async (ruleId: string) => {
    if (!isAdmin) return
    await fetch(`/api/messaging/automation-rules/${ruleId}`, { method: 'DELETE' })
    await load()
  }

  const savePracticeForms = async () => {
    if (!isAdmin) {
      setFormsMessage({ type: 'error', text: 'Only administrators can save practice forms.' })
      return
    }

    let formsToSave = [...practiceForms]
    let nextDefaultId = defaultIntakeFormId

    if (newForm.name.trim() || newForm.url.trim()) {
      if (!newForm.name.trim() || !newForm.url.trim()) {
        setFormsMessage({
          type: 'error',
          text: 'Complete the form name and URL, or clear the new form fields before saving.',
        })
        return
      }
      if (!isValidFormUrl(newForm.url)) {
        setFormsMessage({
          type: 'error',
          text: 'Enter a valid form URL (e.g. hptz.io/... or https://hptz.io/...).',
        })
        return
      }
      const pending: PracticeForm = {
        id: crypto.randomUUID(),
        name: newForm.name.trim(),
        description: newForm.description.trim(),
        url: normalizeFormUrl(newForm.url.trim()),
        isActive: true,
      }
      formsToSave = [...formsToSave, pending]
      setPracticeForms(formsToSave)
      if (!nextDefaultId) nextDefaultId = pending.id
      if (!defaultIntakeFormId) setDefaultIntakeFormId(pending.id)
      setNewForm({ name: '', description: '', url: '' })
    }

    if (formsToSave.length === 0) {
      setFormsMessage({ type: 'error', text: 'Add at least one form before saving.' })
      return
    }

    setSavingForms(true)
    setFormsMessage(null)
    try {
      const res = await fetch('/api/settings/messaging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalConfig: {
            ...buildPortalConfig(),
            practiceForms: formsToSave,
            ...(nextDefaultId ? { defaultIntakeFormId: nextDefaultId } : {}),
          },
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
      }
      if (!res.ok) {
        const detail =
          data.details?.fieldErrors?.practiceForms?.[0] ??
          data.details?.formErrors?.[0] ??
          data.error
        throw new Error(detail ?? 'Save failed')
      }
      setFormsMessage({ type: 'success', text: 'Practice forms saved.' })
      await load()
    } catch (e) {
      setFormsMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to save practice forms.',
      })
    } finally {
      setSavingForms(false)
    }
  }

  const addPracticeForm = () => {
    if (!newForm.name.trim() || !newForm.url.trim()) {
      setFormsMessage({ type: 'error', text: 'Enter a form name and URL.' })
      return
    }
    if (!isValidFormUrl(newForm.url)) {
      setFormsMessage({
        type: 'error',
        text: 'Enter a valid form URL (e.g. hptz.io/... or https://hptz.io/...).',
      })
      return
    }
    const form: PracticeForm = {
      id: crypto.randomUUID(),
      name: newForm.name.trim(),
      description: newForm.description.trim(),
      url: normalizeFormUrl(newForm.url.trim()),
      isActive: true,
    }
    setPracticeForms((prev) => [...prev, form])
    if (!defaultIntakeFormId) setDefaultIntakeFormId(form.id)
    setNewForm({ name: '', description: '', url: '' })
    setFormsMessage({ type: 'success', text: `"${form.name}" added. Click Save Practice Forms to keep it.` })
  }

  const deletePracticeForm = (id: string) => {
    setPracticeForms((prev) => prev.filter((f) => f.id !== id))
    if (defaultIntakeFormId === id) setDefaultIntakeFormId('')
    if (editingFormId === id) {
      setEditingFormId(null)
      setEditFormDraft(null)
    }
  }

  const startEditForm = (form: PracticeForm) => {
    setEditingFormId(form.id)
    setEditFormDraft({ ...form })
  }

  const saveEditForm = () => {
    if (!editFormDraft) return
    if (!isValidFormUrl(editFormDraft.url)) {
      setFormsMessage({
        type: 'error',
        text: 'Enter a valid form URL (e.g. hptz.io/... or https://hptz.io/...).',
      })
      return
    }
    const updated = {
      ...editFormDraft,
      url: normalizeFormUrl(editFormDraft.url),
    }
    setPracticeForms((prev) =>
      prev.map((f) => (f.id === updated.id ? updated : f)),
    )
    setEditingFormId(null)
    setEditFormDraft(null)
    setFormsMessage({ type: 'success', text: 'Form updated. Click Save Practice Forms to keep changes.' })
  }

  const toggleFormActive = (id: string) => {
    setPracticeForms((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f)),
    )
  }

  const activeForms = getActivePracticeForms(practiceForms)

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading messaging settings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">Messaging Module</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={messagingEnabled}
              onChange={(e) => setMessagingEnabled(e.target.checked)}
              disabled={!isAdmin}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Enable patient messaging (portal, web chat widget, CRM inbox)
            </span>
          </label>

          <div>
            <label className={labelCls}>Portal base URL</label>
            <Input
              className={inputCls}
              value={portalBaseUrl}
              onChange={(e) => setPortalBaseUrl(e.target.value)}
              placeholder="https://your-domain.com/portal"
              disabled={!isAdmin}
            />
          </div>

          <div>
            <label className={labelCls}>Web chat welcome message</label>
            <Textarea
              className={inputCls}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              disabled={!isAdmin}
              rows={2}
            />
          </div>

          <div>
            <label className={labelCls}>Offline message</label>
            <Textarea
              className={inputCls}
              value={offlineMessage}
              onChange={(e) => setOfflineMessage(e.target.value)}
              disabled={!isAdmin}
              rows={2}
            />
          </div>

          <div>
            <label className={labelCls}>Widget color</label>
            <Input
              className={inputCls}
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Default routing (reason → inbox)</label>
            {REASON_OPTIONS.map((reason) => (
              <div key={reason} className="flex items-center gap-2">
                <span className="text-xs w-24 text-slate-500">{reason}</span>
                <Input
                  className={`${inputCls} h-8 text-sm`}
                  value={routingRules[reason] ?? ''}
                  onChange={(e) =>
                    setRoutingRules((prev) => ({ ...prev, [reason]: e.target.value }))
                  }
                  disabled={!isAdmin}
                />
              </div>
            ))}
          </div>

          {isAdmin && (
            <Button onClick={() => void saveSettings()} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? 'Saving...' : 'Save Messaging Settings'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">SMS (Twilio)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">SMS Provider</span>
              <span className="text-slate-900 dark:text-slate-100 font-medium">
                {smsProvider ?? 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">SMS Number</span>
              <span className="text-slate-900 dark:text-slate-100 font-medium font-mono">
                {smsNumberMasked ?? '—'}
              </span>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendNotificationOnStaffReply}
              onChange={(e) => setSendNotificationOnStaffReply(e.target.checked)}
              disabled={!isAdmin}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Send SMS notifications when staff replies
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendOtpCodes}
              onChange={(e) => setSendOtpCodes(e.target.checked)}
              disabled={!isAdmin}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Send SMS for portal verification codes
            </span>
          </label>

          <p className="text-xs text-slate-500">
            SMS is notification-only — no patient health information is sent in text messages.
            Twilio credentials are configured via server environment variables.
          </p>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Automated messages are sent only to parents who have verified their phone number
            through the patient portal. Messages do not contain medical information — patients
            tap a secure link to view details.
          </p>

          {automationRules.map((rule) => (
            <div
              key={rule.id}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 dark:text-slate-50">{rule.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {AUTOMATION_TRIGGER_LABELS[rule.triggerEvent as keyof typeof AUTOMATION_TRIGGER_LABELS] ??
                      rule.triggerEvent}
                    {' · '}
                    {formatDelayLabel(rule.triggerEvent, rule.delayMinutes)}
                    {' · '}
                    {rule.channel}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={() => void toggleRuleActive(rule)}
                      disabled={!isAdmin}
                      className="h-3.5 w-3.5 rounded"
                    />
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </label>
                  {isAdmin && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => startEditRule(rule)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500"
                        onClick={() => void deleteRule(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {editingRuleId === rule.id ? (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <label className={labelCls}>Timing (minutes)</label>
                    <Input
                      className={`${inputCls} h-8 text-sm`}
                      type="number"
                      min={0}
                      value={editDraft.delayMinutes}
                      onChange={(e) =>
                        setEditDraft((d) => ({
                          ...d,
                          delayMinutes: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Message body</label>
                    <Textarea
                      className={inputCls}
                      value={editDraft.templateBody}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, templateBody: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveRuleEdit(rule.id)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingRuleId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 line-clamp-2">{rule.template.body}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">Message Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-900 dark:text-slate-50">
                  {t.category} — {t.name}
                </p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.body}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500"
                onClick={() => void deleteTemplate(t.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="grid gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Input
              className={inputCls}
              placeholder="Template name"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
            />
            <Input
              className={inputCls}
              placeholder="Category (e.g. Scheduling)"
              value={newTemplate.category}
              onChange={(e) => setNewTemplate((p) => ({ ...p, category: e.target.value }))}
            />
            <Textarea
              className={inputCls}
              placeholder="Body with merge tags: {{patient.firstName}}, {{practice.name}}, {{portal.link}}"
              value={newTemplate.body}
              onChange={(e) => setNewTemplate((p) => ({ ...p, body: e.target.value }))}
              rows={3}
            />
            <Button type="button" variant="outline" onClick={() => void createTemplate()}>
              <Plus className="h-4 w-4 mr-1" />
              Add Template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">File Sharing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Configure file attachment limits for patient and staff messaging. Files are stored
            securely and accessed through authenticated download links only.
          </p>

          <div>
            <label className={labelCls}>Max file size</label>
            <select
              className={`${inputCls} h-10 w-full rounded-md border px-3 text-sm`}
              value={fileSharing.maxFileSizeMb}
              disabled={!isAdmin}
              onChange={(e) =>
                setFileSharing((prev) => ({
                  ...prev,
                  maxFileSizeMb: Number(e.target.value) as FileSharingConfig['maxFileSizeMb'],
                }))
              }
            >
              <option value={5}>5 MB</option>
              <option value={10}>10 MB</option>
              <option value={25}>25 MB</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Allowed file types</label>
            {[
              { key: 'allowImages' as const, label: 'Images (JPEG, PNG, GIF, WebP)' },
              { key: 'allowPdf' as const, label: 'PDF documents' },
              { key: 'allowWord' as const, label: 'Word documents' },
              { key: 'allowPlainText' as const, label: 'Plain text files' },
            ].map((item) => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fileSharing[item.key]}
                  onChange={(e) =>
                    setFileSharing((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                  disabled={!isAdmin}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50 flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Practice Forms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Register HIPPAtizer forms staff can send to patients from the message composer.
            The default intake form is used by the automated intake reminder.
          </p>

          {formsMessage && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                formsMessage.type === 'success'
                  ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                  : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
              }`}
            >
              {formsMessage.text}
            </div>
          )}

          {practiceForms.map((form) => (
            <div
              key={form.id}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2"
            >
              {editingFormId === form.id && editFormDraft ? (
                <div className="space-y-2">
                  <Input
                    className={inputCls}
                    value={editFormDraft.name}
                    onChange={(e) =>
                      setEditFormDraft((d) => (d ? { ...d, name: e.target.value } : d))
                    }
                    placeholder="Form name"
                  />
                  <Input
                    className={inputCls}
                    value={editFormDraft.description}
                    onChange={(e) =>
                      setEditFormDraft((d) => (d ? { ...d, description: e.target.value } : d))
                    }
                    placeholder="Description"
                  />
                  <Input
                    className={inputCls}
                    value={editFormDraft.url}
                    onChange={(e) =>
                      setEditFormDraft((d) => (d ? { ...d, url: e.target.value } : d))
                    }
                    placeholder="https://hptz.io/..."
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={saveEditForm}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingFormId(null)
                        setEditFormDraft(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-slate-50">
                        {form.name}
                      </p>
                      {form.description ? (
                        <p className="text-xs text-slate-500 mt-0.5">{form.description}</p>
                      ) : null}
                      <p className="text-xs text-slate-400 mt-1 font-mono truncate">{form.url}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={() => toggleFormActive(form.id)}
                          disabled={!isAdmin}
                          className="h-3.5 w-3.5 rounded"
                        />
                        {form.isActive ? 'Active' : 'Inactive'}
                      </label>
                      {isAdmin && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEditForm(form)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500"
                            onClick={() => deletePracticeForm(form.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {form.isActive && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="defaultIntakeForm"
                        checked={defaultIntakeFormId === form.id}
                        onChange={() => setDefaultIntakeFormId(form.id)}
                        disabled={!isAdmin}
                      />
                      Default for intake reminder automation
                    </label>
                  )}
                </>
              )}
            </div>
          ))}

          {isAdmin && (
            <div className="grid gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Input
                className={inputCls}
                placeholder="Form name (e.g. New Patient Intake Form)"
                value={newForm.name}
                onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                className={inputCls}
                placeholder="Description (e.g. Complete before your first visit)"
                value={newForm.description}
                onChange={(e) => setNewForm((p) => ({ ...p, description: e.target.value }))}
              />
              <Input
                className={inputCls}
                placeholder="Form URL (https://hptz.io/...)"
                value={newForm.url}
                onChange={(e) => setNewForm((p) => ({ ...p, url: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={addPracticeForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Form
                </Button>
                <Button
                  type="button"
                  onClick={() => void savePracticeForms()}
                  disabled={savingForms}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {savingForms ? 'Saving...' : 'Save Practice Forms'}
                </Button>
              </div>
            </div>
          )}

          {practiceForms.length > 0 && activeForms.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              All forms are inactive — staff will not see any forms in the composer.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="dark:text-slate-50">Shared Inboxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inboxes.map((inbox) => (
            <div
              key={inbox.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Inbox className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-slate-900 dark:text-slate-50">{inbox.name}</p>
                  {inbox.description && (
                    <p className="text-xs text-slate-500">{inbox.description}</p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant={inbox.isSubscribed ? 'default' : 'outline'}
                size="sm"
                className="text-xs shrink-0"
                onClick={() => void toggleSubscribe(inbox)}
              >
                {inbox.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Button>
            </div>
          ))}

          {isAdmin && (
            <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Input
                className={inputCls}
                placeholder="New inbox name"
                value={newInboxName}
                onChange={(e) => setNewInboxName(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => void createInbox()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
