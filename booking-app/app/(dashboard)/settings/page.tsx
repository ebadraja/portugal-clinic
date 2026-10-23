'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Mic,
  Calendar,
  BookOpen,
  Puzzle,
  Bell,
  Lock,
  User,
  CheckCircle,
  AlertCircle,
  Eye as EyeIcon,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Mail,
  Activity,
  CalendarClock,
  BarChart3,
} from 'lucide-react';
import { PracticeSettingsTab } from '@/components/settings/PracticeSettingsTab';
import { AgendaRemindersTab } from '@/components/settings/AgendaRemindersTab';
import { VoiceAgentTab } from '@/components/settings/VoiceAgentTab';
import { AppointmentTypesTab } from '@/components/settings/AppointmentTypesTab';
import { KnowledgeBaseTab } from '@/components/settings/KnowledgeBaseTab';
import { NotificationsTab } from '@/components/settings/NotificationsTab';
import { SystemStatusTab } from '@/components/settings/SystemStatusTab';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { SecurityAuditTab } from '@/components/settings/SecurityAuditTab';
import { UsageTab } from '@/components/settings/UsageTab';
import { AccountTab } from '@/components/settings/AccountTab';

const labelCls = "block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2";

function SettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') ?? 'practice');
  const [loading, setLoading] = useState(true);
  // Gmail (email sending) state — reuses the Google OAuth client
  const [gmail, setGmail] = useState({
    connected: false,
    enabled: false,
    senderEmail: null as string | null,
    fromName: '',
    hasGoogleCreds: false,
    hasClientId: false,
    hasClientSecret: false,
  });
  const [gmailFromName, setGmailFromName] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [showGoogleClientId, setShowGoogleClientId] = useState(false);
  const [showGoogleClientSecret, setShowGoogleClientSecret] = useState(false);
  const [changingGoogleClientId, setChangingGoogleClientId] = useState(false);
  const [changingGoogleClientSecret, setChangingGoogleClientSecret] = useState(false);
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailMessage, setGmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    loadGmailSettings();
  }, []);

  // Handle Gmail OAuth callback messages
  useEffect(() => {
    if (activeTab !== 'email') return;
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === '1') {
      setGmailMessage({ type: 'success', text: 'Gmail connected successfully! Emails will now send from your account.' });
      loadGmailSettings();
      setTimeout(() => setGmailMessage(null), 5000);
    } else if (error) {
      const msgs: Record<string, string> = {
        missing_credentials: 'Save your Google Client ID and Secret first.',
        token_exchange_failed: 'Token exchange failed — check your credentials and redirect URI.',
        server_error: 'A server error occurred.',
        no_code: 'Authorization was cancelled.',
      };
      setGmailMessage({ type: 'error', text: msgs[error] ?? `OAuth error: ${error}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadGmailSettings = async () => {
    try {
      const res = await fetch('/api/settings/email');
      if (res.ok) {
        const data = await res.json();
        setGmail(data);
        setGmailFromName(data.fromName ?? '');
      }
    } catch (err) {
      console.error('Failed to load email settings:', err);
    }
  };

  const handleGmailSave = async () => {
    setGmailSaving(true);
    setGmailMessage(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName: gmailFromName,
          ...(googleClientId.trim() ? { clientId: googleClientId.trim() } : {}),
          ...(googleClientSecret.trim() ? { clientSecret: googleClientSecret.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setGmailMessage({ type: 'error', text: err.error ?? 'Failed to save' });
      } else {
        setGoogleClientId('');
        setGoogleClientSecret('');
        setChangingGoogleClientId(false);
        setChangingGoogleClientSecret(false);
        await loadGmailSettings();
        setGmailMessage({ type: 'success', text: 'Email settings saved.' });
      }
    } catch {
      setGmailMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setGmailSaving(false);
      setTimeout(() => setGmailMessage(null), 5000);
    }
  };

  const handleGmailToggleEnabled = async (enabled: boolean) => {
    try {
      await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setGmail((prev) => ({ ...prev, enabled }));
    } catch {
      /* silent */
    }
  };

  const handleGmailDisconnect = async () => {
    if (!confirm('Disconnect Gmail? Emails will stop sending until reconnected.')) return;
    try {
      await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true }),
      });
      await loadGmailSettings();
      setGmailMessage({ type: 'success', text: 'Gmail disconnected.' });
      setTimeout(() => setGmailMessage(null), 3000);
    } catch {
      setGmailMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const NAV_TABS = [
    { id: 'status', label: 'System Status', icon: Activity },
    { id: 'practice', label: 'Practice Information', icon: Settings },
    { id: 'agenda', label: 'Agenda & Reminders', icon: CalendarClock },
    { id: 'ai', label: 'AI Voice Agent', icon: Mic },
    { id: 'appointments', label: 'Appointment Types', icon: Calendar },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'integrations', label: 'Integrations', icon: Puzzle },
    { id: 'email', label: 'Email (Gmail)', icon: Mail },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security & Audit', icon: Lock },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'account', label: 'Account & Profile', icon: User },
  ];

  return (
    <div className="pt-4 pb-8 space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Configure your CRM, integrations, and AI behavior</p>
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">

          {loading ? (
            <div className="space-y-6">
              <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-56 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ) : (
          <>
          {/* ── Practice Information ── */}
          {activeTab === 'practice' && <PracticeSettingsTab />}
          {activeTab === 'agenda' && <AgendaRemindersTab />}

          {/* ── AI Voice Agent ── */}
          {activeTab === 'ai' && <VoiceAgentTab />}

          {/* ── Appointment Types ── */}
          {activeTab === 'appointments' && <AppointmentTypesTab />}

          {/* ── Knowledge Base ── */}
          {activeTab === 'knowledge' && <KnowledgeBaseTab />}

          {/* ── Integrations ── */}
          {activeTab === 'integrations' && <IntegrationsTab onOpenTab={setActiveTab} />}

          {/* ── Email (Gmail) ── */}
          {activeTab === 'email' && (
            <div className="space-y-6">
              {gmailMessage && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  gmailMessage.type === 'success'
                    ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                }`}>
                  {gmailMessage.type === 'success'
                    ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />}
                  <p className={`text-sm font-medium ${
                    gmailMessage.type === 'success'
                      ? 'text-green-800 dark:text-green-300'
                      : 'text-red-800 dark:text-red-300'
                  }`}>{gmailMessage.text}</p>
                </div>
              )}

              {/* Status card */}
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50 flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Sending (Gmail)
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Sends CRM emails (appointment confirmations, reminders, staff invites and password
                    resets) through your Google Workspace account via the Gmail API.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`rounded-lg p-4 flex items-start gap-3 border ${
                    gmail.connected
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}>
                    {gmail.connected
                      ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      : <AlertCircle className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className={`text-sm font-medium ${gmail.connected ? 'text-green-900 dark:text-green-200' : 'text-slate-700 dark:text-slate-300'}`}>
                        {gmail.connected ? 'Connected & Authorized' : 'Not Connected'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {gmail.connected
                          ? `Sending as: ${gmail.senderEmail ?? 'unknown'}`
                          : 'Click Connect Gmail to authorize sending via Google OAuth.'}
                      </p>
                    </div>
                  </div>

                  {!gmail.hasGoogleCreds && (
                    <div className="rounded-lg p-4 flex items-start gap-3 border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Google OAuth client not set up</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Add your Google Client ID and Secret under Configuration below, save, then connect Gmail.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Enable toggle (only relevant when connected) */}
                  {gmail.connected && (
                    <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enable email sending</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">When off, the CRM will not send any emails through Gmail</p>
                      </div>
                      <button
                        onClick={() => handleGmailToggleEnabled(!gmail.enabled)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${gmail.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${gmail.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Configuration */}
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50 text-base">Configuration</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    In Google Cloud Console, create an OAuth 2.0 client (Web application), enable the{' '}
                    <strong>Gmail API</strong>, add the{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">.../auth/gmail.send</code>{' '}
                    scope to your OAuth consent screen, and add this redirect URI:{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/gmail/callback
                    </code>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className={labelCls}>Google Client ID</label>
                    {gmail.hasClientId && !changingGoogleClientId ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="text"
                          disabled
                          placeholder="Client ID saved — click Change to update"
                          className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 flex-1 italic"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 shrink-0"
                          onClick={() => setChangingGoogleClientId(true)}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showGoogleClientId ? 'text' : 'password'}
                            value={googleClientId}
                            onChange={(e) => setGoogleClientId(e.target.value)}
                            placeholder="Paste your Google Client ID"
                            className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGoogleClientId((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showGoogleClientId ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {changingGoogleClientId && (
                          <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300 shrink-0" onClick={() => { setChangingGoogleClientId(false); setGoogleClientId(''); }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Google Client Secret</label>
                    {gmail.hasClientSecret && !changingGoogleClientSecret ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="text"
                          disabled
                          placeholder="Client Secret saved — click Change to update"
                          className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 flex-1 italic"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 shrink-0"
                          onClick={() => setChangingGoogleClientSecret(true)}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showGoogleClientSecret ? 'text' : 'password'}
                            value={googleClientSecret}
                            onChange={(e) => setGoogleClientSecret(e.target.value)}
                            placeholder="Paste your Google Client Secret"
                            className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGoogleClientSecret((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showGoogleClientSecret ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {changingGoogleClientSecret && (
                          <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300 shrink-0" onClick={() => { setChangingGoogleClientSecret(false); setGoogleClientSecret(''); }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* From name */}
                  <div>
                    <label className={labelCls}>From Name (optional)</label>
                    <Input
                      value={gmailFromName}
                      onChange={(e) => setGmailFromName(e.target.value)}
                      placeholder="e.g. Clínica Dentária Nunes Monteiro"
                      className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      The display name recipients see. The from-address is your connected Google account
                      {gmail.senderEmail ? ` (${gmail.senderEmail})` : ''}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      onClick={handleGmailSave}
                      disabled={gmailSaving}
                      className="bg-blue-600 hover:bg-blue-700 gap-2"
                    >
                      {gmailSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                      Save Settings
                    </Button>

                    {gmail.hasGoogleCreds && !gmail.connected && (
                      <a href="/api/auth/gmail">
                        <Button className="bg-green-600 hover:bg-green-700 gap-2">
                          <ExternalLink className="w-4 h-4" />
                          Connect Gmail
                        </Button>
                      </a>
                    )}

                    {gmail.connected && (
                      <>
                        <a href="/api/auth/gmail">
                          <Button variant="outline" className="gap-2 dark:border-slate-600 dark:text-slate-300">
                            <RefreshCw className="w-4 h-4" />
                            Re-authorize
                          </Button>
                        </a>
                        <Button
                          variant="outline"
                          onClick={handleGmailDisconnect}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:border-slate-600"
                        >
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && <NotificationsTab />}

          {/* ── System Status ── */}
          {activeTab === 'status' && <SystemStatusTab onOpenTab={setActiveTab} />}

          {/* ── Security & Audit ── */}
          {activeTab === 'security' && <SecurityAuditTab />}

          {/* ── Usage ── */}
          {activeTab === 'usage' && <UsageTab />}

          {/* ── Account ── */}
          {activeTab === 'account' && <AccountTab />}

          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading settings…</div>}>
      <SettingsPage />
    </Suspense>
  );
}
