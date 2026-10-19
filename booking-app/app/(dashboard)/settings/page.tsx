'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Mic,
  MessageSquare,
  Calendar,
  BookOpen,
  Puzzle,
  Bell,
  Lock,
  User,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  Eye as EyeIcon,
  EyeOff,
  Zap,
  RefreshCw,
  ExternalLink,
  Mail,
  Inbox,
  Activity,
  CalendarClock,
  BarChart3,
} from 'lucide-react';
import { WebhookTestingComponent } from '@/components/webhook-testing';
import { MessagingSettingsTab } from '@/components/messaging/MessagingSettingsTab';
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

interface SettingsState {
  chatbot: {
    active: boolean;
    welcomeMessage: string;
    position: string;
    theme: string;
    autoTriggerSeconds: number;
  };
  hippatizer: {
    enabled: boolean;
    apiKey: string;
    autoMatch: boolean;
    createDrafts: boolean;
    emailNotifications: boolean;
  };
}

const selectCls = "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const textareaCls = "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2";

function SettingsPage() {
  const searchParams = useSearchParams();
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') ?? 'practice');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [changingApiKey, setChangingApiKey] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);

  // Google Calendar state
  const [gcal, setGcal] = useState({
    connected: false,
    enabled: false,
    hasClientId: false,
    hasClientSecret: false,
    calendarId: 'primary',
    syncDirection: 'read_only',
    lastSync: null as string | null,
  });
  const [gcalClientId, setGcalClientId] = useState('');
  const [gcalClientSecret, setGcalClientSecret] = useState('');
  const [gcalCalendarId, setGcalCalendarId] = useState('primary');
  const [gcalSyncDirection, setGcalSyncDirection] = useState('read_only');
  const [gcalSaving, setGcalSaving] = useState(false);
  const [gcalMessage, setGcalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showGcalClientId, setShowGcalClientId] = useState(false);
  const [showGcalClientSecret, setShowGcalClientSecret] = useState(false);
  const [changingGcalClientId, setChangingGcalClientId] = useState(false);
  const [changingGcalClientSecret, setChangingGcalClientSecret] = useState(false);

  // Gmail (email sending) state — reuses the Google OAuth client
  const [gmail, setGmail] = useState({
    connected: false,
    enabled: false,
    senderEmail: null as string | null,
    fromName: '',
    hasGoogleCreds: false,
  });
  const [gmailFromName, setGmailFromName] = useState('');
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailMessage, setGmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Load staff members for access control
    loadStaffMembers();
    // Load Hippatizer settings
    loadHippatizSettings();
    // Load Google Calendar settings
    loadGcalSettings();
    // Load Email (Gmail) settings
    loadGmailSettings();
  }, []);

  // Handle OAuth callback messages
  useEffect(() => {
    if (activeTab !== 'google-calendar') return;
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === '1') {
      setGcalMessage({ type: 'success', text: 'Google Calendar connected successfully!' });
      loadGcalSettings();
      setTimeout(() => setGcalMessage(null), 5000);
    } else if (error) {
      const msgs: Record<string, string> = {
        missing_credentials: 'Save your Client ID and Secret first.',
        token_exchange_failed: 'Token exchange failed — check your credentials.',
        server_error: 'A server error occurred.',
        no_code: 'Authorization was cancelled.',
      };
      setGcalMessage({ type: 'error', text: msgs[error] ?? `OAuth error: ${error}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
        missing_credentials: 'Set up your Google OAuth credentials in the Google Calendar tab first.',
        token_exchange_failed: 'Token exchange failed — check your credentials and redirect URI.',
        server_error: 'A server error occurred.',
        no_code: 'Authorization was cancelled.',
      };
      setGmailMessage({ type: 'error', text: msgs[error] ?? `OAuth error: ${error}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadStaffMembers = async () => {
    try {
      const res = await fetch('/api/settings/access-control');
      if (res.ok) {
        const data = await res.json();
        setStaffMembers(data.staff);
      }
    } catch (error) {
      console.error('Failed to load staff members:', error);
    }
  };

  const loadHippatizSettings = async () => {
    try {
      const res = await fetch('/api/settings/hippatizer');
      if (res.ok) {
        const data = await res.json();
        setHasApiKey(data.hasApiKey ?? false);
        setSettings((prev) => ({
          ...prev,
          hippatizer: {
            ...prev.hippatizer,
            enabled: data.enabled ?? false,
            emailNotifications: data.emailNotifications ?? true,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to load Hippatizer settings:', error);
    }
  };

  const loadGcalSettings = async () => {
    try {
      const res = await fetch('/api/settings/google-calendar');
      if (res.ok) {
        const data = await res.json();
        setGcal(data);
        setGcalCalendarId(data.calendarId ?? 'primary');
        setGcalSyncDirection(data.syncDirection ?? 'read_only');
      }
    } catch (err) {
      console.error('Failed to load Google Calendar settings:', err);
    }
  };

  const handleGcalSave = async () => {
    setGcalSaving(true);
    setGcalMessage(null);
    try {
      const body: Record<string, unknown> = {
        calendarId: gcalCalendarId,
        syncDirection: gcalSyncDirection,
      };
      if (gcalClientId.trim()) body.clientId = gcalClientId.trim();
      if (gcalClientSecret.trim()) body.clientSecret = gcalClientSecret.trim();

      const res = await fetch('/api/settings/google-calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setGcalMessage({ type: 'error', text: err.error ?? 'Failed to save' });
      } else {
        setGcalClientId('');
        setGcalClientSecret('');
        setChangingGcalClientId(false);
        setChangingGcalClientSecret(false);
        await loadGcalSettings();
        setGcalMessage({ type: 'success', text: 'Settings saved. Now click Connect to authorize Google.' });
      }
    } catch {
      setGcalMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setGcalSaving(false);
      setTimeout(() => setGcalMessage(null), 5000);
    }
  };

  const handleGcalToggleEnabled = async (enabled: boolean) => {
    try {
      await fetch('/api/settings/google-calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setGcal((prev) => ({ ...prev, enabled }));
    } catch {
      /* silent */
    }
  };

  const handleGcalDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar? This will remove the OAuth tokens.')) return;
    try {
      await fetch('/api/settings/google-calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true }),
      });
      await loadGcalSettings();
      setGcalMessage({ type: 'success', text: 'Google Calendar disconnected.' });
      setTimeout(() => setGcalMessage(null), 3000);
    } catch {
      setGcalMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

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
        body: JSON.stringify({ fromName: gmailFromName }),
      });
      if (!res.ok) {
        const err = await res.json();
        setGmailMessage({ type: 'error', text: err.error ?? 'Failed to save' });
      } else {
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

  const handleClearApiKey = async () => {
    try {
      const res = await fetch('/api/settings/hippatizer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clearApiKey: true,
          enabled: false,
          emailNotifications: settings.hippatizer.emailNotifications,
        }),
      });
      if (res.ok) {
        setHasApiKey(false);
        setChangingApiKey(false);
        setSettings((prev) => ({
          ...prev,
          hippatizer: { ...prev.hippatizer, apiKey: '', enabled: false },
        }));
        setSaveMessage({ type: 'success', text: 'API key cleared successfully' });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to clear API key' });
    }
  };

  const handleTestApiKey = async () => {
    setTestingApiKey(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings/hippatizer/test-notification', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Test notification sent! Check your notifications bell.' });
      } else {
        setSaveMessage({ type: 'error', text: data.error || 'Test failed. Check server logs.' });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to send test notification' });
    } finally {
      setTestingApiKey(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };
  const [settings, setSettings] = useState<SettingsState>({
    chatbot: {
      active: true,
      welcomeMessage: 'Hi there! 👋 How can we help you today?',
      position: 'bottom-right',
      theme: '#3b82f6',
      autoTriggerSeconds: 30,
    },
    hippatizer: {
      enabled: false,
      apiKey: '',
      autoMatch: true,
      createDrafts: true,
      emailNotifications: true,
    },
  });

  const handleSettingChange = (section: keyof SettingsState, field: string, value: any) => {
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      // Save Hippatizer settings if in Hippatizer tab
      if (activeTab === 'hippatizer') {
        // Auto-enable if API key is provided
        const isEnabled = settings.hippatizer.apiKey?.trim().length > 0 ? true : settings.hippatizer.enabled;

        const res = await fetch('/api/settings/hippatizer', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: settings.hippatizer.apiKey,
            enabled: isEnabled,
            autoMatch: settings.hippatizer.autoMatch,
            createDrafts: settings.hippatizer.createDrafts,
            emailNotifications: settings.hippatizer.emailNotifications,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          setSaveMessage({ type: 'error', text: error.error || 'Failed to save settings' });
          setSaving(false);
          return;
        }

        // If a new key was entered, mark it as saved and clear the input field
        if (settings.hippatizer.apiKey?.trim()) {
          setHasApiKey(true);
          setChangingApiKey(false);
        }
        setSettings((prev) => ({
          ...prev,
          hippatizer: {
            ...prev.hippatizer,
            enabled: isEnabled,
            apiKey: '', // Always clear after save — key is stored securely server-side
          },
        }));

        setSaveMessage({ type: 'success', text: 'Hippatizer settings saved successfully!' });
      } else {
        // Only the Hippatizer tab still uses this page-level save. Other tabs save
        // themselves; the Website Chatbot tab is not wired to the server yet.
        setSaveMessage({ type: 'error', text: 'These settings are not saved yet (Website Chatbot is pending).' });
        setSaving(false);
        return;
      }

      setHasChanges(false);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage({ type: 'error', text: 'An error occurred while saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleStaffAccessChange = async (userId: string, permission: string, value: boolean) => {
    try {
      const staff = staffMembers.find((s) => s.id === userId);
      const res = await fetch('/api/settings/access-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          canView: permission === 'view' ? value : staff?.access.canView,
          canMatch: permission === 'match' ? value : staff?.access.canMatch,
          canPublish: permission === 'publish' ? value : staff?.access.canPublish,
        }),
      });

      if (res.ok) {
        await loadStaffMembers();
        setSaveMessage({ type: 'success', text: `Access updated for ${staff?.name}` });
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (error) {
      console.error('Access control error:', error);
      setSaveMessage({ type: 'error', text: 'Failed to update access control' });
    }
  };

  const NAV_TABS = [
    { id: 'status', label: 'System Status', icon: Activity },
    { id: 'practice', label: 'Practice Information', icon: Settings },
    { id: 'agenda', label: 'Agenda & Reminders', icon: CalendarClock },
    { id: 'ai', label: 'AI Voice Agent', icon: Mic },
    { id: 'chatbot', label: 'Website Chatbot', icon: MessageSquare },
    { id: 'appointments', label: 'Appointment Types', icon: Calendar },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'integrations', label: 'Integrations', icon: Puzzle },
    { id: 'google-calendar', label: 'Google Calendar', icon: Calendar },
    { id: 'email', label: 'Email (Gmail)', icon: Mail },
    { id: 'hippatizer', label: 'Intake Forms (Hippatizer)', icon: FileText },
    { id: 'messaging', label: 'Patient Messaging', icon: Inbox },
    { id: 'webhook-test', label: 'Test Webhook', icon: Zap },
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
        {hasChanges && (
          <Button className="bg-blue-600 hover:bg-blue-700 self-start sm:self-auto" onClick={handleSave}>
            Save Changes
          </Button>
        )}
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

          {/* ── Website Chatbot ── */}
          {activeTab === 'chatbot' && (
            <div className="space-y-6">
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="dark:text-slate-50">Chatbot Status</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${settings.chatbot.active ? 'bg-green-500' : 'bg-slate-400'}`} />
                      <span className={`text-sm font-medium ${settings.chatbot.active ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {settings.chatbot.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className={labelCls}>Welcome Message</label>
                    <textarea value={settings.chatbot.welcomeMessage} onChange={(e) => handleSettingChange('chatbot', 'welcomeMessage', e.target.value)} className={textareaCls} rows={3} />
                  </div>
                  <div>
                    <label className={labelCls}>Widget Position</label>
                    <select value={settings.chatbot.position} onChange={(e) => handleSettingChange('chatbot', 'position', e.target.value)} className={selectCls}>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Color Theme</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={settings.chatbot.theme} onChange={(e) => handleSettingChange('chatbot', 'theme', e.target.value)} className="w-12 h-10 rounded border border-slate-300 dark:border-slate-600 cursor-pointer" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{settings.chatbot.theme}</span>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Auto-trigger after (seconds)</label>
                    <Input type="number" min="10" max="120" className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={settings.chatbot.autoTriggerSeconds} onChange={(e) => handleSettingChange('chatbot', 'autoTriggerSeconds', parseInt(e.target.value))} />
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader><CardTitle className="dark:text-slate-50">Quick Reply Buttons</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {['Book Appointment', 'Ask a Question', 'Office Hours', 'Insurance Info'].map((btn, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/40">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{btn}</span>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full gap-2 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Plus className="w-4 h-4" />Add Button
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Appointment Types ── */}
          {activeTab === 'appointments' && <AppointmentTypesTab />}

          {/* ── Knowledge Base ── */}
          {activeTab === 'knowledge' && <KnowledgeBaseTab />}

          {/* ── Integrations ── */}
          {activeTab === 'integrations' && <IntegrationsTab onOpenTab={setActiveTab} />}

          {/* ── Google Calendar ── */}
          {activeTab === 'google-calendar' && (
            <div className="space-y-6">
              {gcalMessage && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  gcalMessage.type === 'success'
                    ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                }`}>
                  {gcalMessage.type === 'success'
                    ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />}
                  <p className={`text-sm font-medium ${
                    gcalMessage.type === 'success'
                      ? 'text-green-800 dark:text-green-300'
                      : 'text-red-800 dark:text-red-300'
                  }`}>{gcalMessage.text}</p>
                </div>
              )}

              {/* Status card */}
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Google Calendar Integration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`rounded-lg p-4 flex items-start gap-3 border ${
                    gcal.connected
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}>
                    {gcal.connected
                      ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      : <AlertCircle className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className={`text-sm font-medium ${gcal.connected ? 'text-green-900 dark:text-green-200' : 'text-slate-700 dark:text-slate-300'}`}>
                        {gcal.connected ? 'Connected & Authorized' : 'Not Connected'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {gcal.connected
                          ? `Syncing calendar: ${gcal.calendarId}${gcal.lastSync ? ` · Last sync: ${new Date(gcal.lastSync).toLocaleString()}` : ''}`
                          : 'Save your credentials below, then click Connect to authorize via Google OAuth.'}
                      </p>
                    </div>
                  </div>

                  {/* Enable toggle (only relevant when connected) */}
                  {gcal.connected && (
                    <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Show on Appointments Calendar</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Overlay your Google Calendar events on the appointments view</p>
                      </div>
                      <button
                        onClick={() => handleGcalToggleEnabled(!gcal.enabled)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${gcal.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${gcal.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Credentials */}
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50 text-base">OAuth Credentials</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Create a project in{' '}
                    <span className="text-blue-600 dark:text-blue-400">Google Cloud Console</span>
                    , enable the Calendar API, and create OAuth 2.0 credentials.
                    Set the redirect URI to:{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/google-calendar/callback
                    </code>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Client ID */}
                  <div>
                    <label className={labelCls}>Google Client ID</label>
                    {gcal.hasClientId && !changingGcalClientId ? (
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
                          onClick={() => setChangingGcalClientId(true)}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showGcalClientId ? 'text' : 'password'}
                            value={gcalClientId}
                            onChange={(e) => setGcalClientId(e.target.value)}
                            placeholder="Paste your Google Client ID"
                            className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGcalClientId((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showGcalClientId ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {changingGcalClientId && (
                          <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300 shrink-0" onClick={() => { setChangingGcalClientId(false); setGcalClientId(''); }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Client Secret */}
                  <div>
                    <label className={labelCls}>Google Client Secret</label>
                    {gcal.hasClientSecret && !changingGcalClientSecret ? (
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
                          onClick={() => setChangingGcalClientSecret(true)}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showGcalClientSecret ? 'text' : 'password'}
                            value={gcalClientSecret}
                            onChange={(e) => setGcalClientSecret(e.target.value)}
                            placeholder="Paste your Google Client Secret"
                            className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGcalClientSecret((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showGcalClientSecret ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {changingGcalClientSecret && (
                          <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300 shrink-0" onClick={() => { setChangingGcalClientSecret(false); setGcalClientSecret(''); }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Calendar ID */}
                  <div>
                    <label className={labelCls}>Calendar ID</label>
                    <Input
                      value={gcalCalendarId}
                      onChange={(e) => setGcalCalendarId(e.target.value)}
                      placeholder="primary (or paste your calendar ID)"
                      className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">primary</code> for your main calendar, or paste a specific calendar ID from Google Calendar settings.
                    </p>
                  </div>

                  {/* Sync direction */}
                  <div>
                    <label className={labelCls}>Sync Mode</label>
                    <select
                      value={gcalSyncDirection}
                      onChange={(e) => setGcalSyncDirection(e.target.value)}
                      className={selectCls}
                    >
                      <option value="read_only">Read Only — show Google events on the CRM calendar</option>
                      <option value="two_way">Two-way — also push CRM appointments to Google Calendar</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      onClick={handleGcalSave}
                      disabled={gcalSaving}
                      className="bg-blue-600 hover:bg-blue-700 gap-2"
                    >
                      {gcalSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                      Save Settings
                    </Button>

                    {gcal.hasClientId && gcal.hasClientSecret && !gcal.connected && (
                      <a href="/api/auth/google-calendar">
                        <Button className="bg-green-600 hover:bg-green-700 gap-2">
                          <ExternalLink className="w-4 h-4" />
                          Connect Google Calendar
                        </Button>
                      </a>
                    )}

                    {gcal.connected && (
                      <>
                        <a href="/api/auth/google-calendar">
                          <Button variant="outline" className="gap-2 dark:border-slate-600 dark:text-slate-300">
                            <RefreshCw className="w-4 h-4" />
                            Re-authorize
                          </Button>
                        </a>
                        <Button
                          variant="outline"
                          onClick={handleGcalDisconnect}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:border-slate-600"
                        >
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Setup guide */}
              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader><CardTitle className="dark:text-slate-50 text-base">Setup Guide</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    {[
                      'Go to console.cloud.google.com and create a new project (or select an existing one).',
                      'In the left menu, go to APIs & Services → Library. Search for "Google Calendar API" and enable it.',
                      'Go to APIs & Services → Credentials. Click "Create Credentials" → "OAuth 2.0 Client IDs".',
                      'Choose "Web application". Under Authorized Redirect URIs, add the redirect URI shown above.',
                      'Copy the Client ID and Client Secret and paste them in the fields above. Click Save Settings.',
                      'Click "Connect Google Calendar" to authorize via your Google account.',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}

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
                    Sends all CRM emails (campaigns, automated reminders, notifications) through your
                    Google Workspace account via the Gmail API. Reuses the OAuth client from the Google
                    Calendar tab — no separate credentials needed.
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
                          Add your Google Client ID and Secret in the{' '}
                          <button className="underline font-medium" onClick={() => setActiveTab('google-calendar')}>Google Calendar</button>{' '}
                          tab first — Gmail reuses the same credentials.
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
                    In Google Cloud Console, enable the <strong>Gmail API</strong>, add the{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">.../auth/gmail.send</code>{' '}
                    scope to your OAuth consent screen, and add this redirect URI:{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/gmail/callback
                    </code>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
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

          {/* ── Hippatizer Intake Forms ── */}
          {activeTab === 'hippatizer' && (
            <div className="space-y-6">
              {saveMessage && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  saveMessage.type === 'success'
                    ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                }`}>
                  {saveMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <p className={`text-sm font-medium ${
                    saveMessage.type === 'success'
                      ? 'text-green-800 dark:text-green-300'
                      : 'text-red-800 dark:text-red-300'
                  }`}>
                    {saveMessage.text}
                  </p>
                </div>
              )}

              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Hippatizer Integration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{settings.hippatizer.enabled ? 'Connected & Active' : 'Not Configured'}</p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {settings.hippatizer.enabled
                            ? 'Your Hippatizer forms are being automatically synced and processed'
                            : 'Add your API key to enable form submissions'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Hippatizer API Key</label>
                    {hasApiKey && !changingApiKey ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="text"
                          value=""
                          disabled
                          placeholder="API key saved — click Change to update"
                          className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 flex-1 italic"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 shrink-0"
                          onClick={() => setChangingApiKey(true)}
                        >
                          Change
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:border-slate-600 dark:hover:bg-slate-800 shrink-0"
                          onClick={handleClearApiKey}
                          title="Delete API key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder={changingApiKey ? 'Enter new API key to replace existing' : 'Enter your Hippatizer API key'}
                          value={settings.hippatizer.apiKey}
                          onChange={(e) => handleSettingChange('hippatizer', 'apiKey', e.target.value)}
                          className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </Button>
                        {changingApiKey && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            onClick={() => {
                              setChangingApiKey(false);
                              setSettings((prev) => ({ ...prev, hippatizer: { ...prev.hippatizer, apiKey: '' } }));
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Get your API key from your <a href="https://hippatizer.com/settings" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Hippatizer account settings</a>
                    </p>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h3 className="font-medium text-slate-900 dark:text-slate-50 mb-3 text-sm">Integration Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-match patients</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Automatically link forms to existing patients when confidence {'>='} 85%</p>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={settings.hippatizer.autoMatch}
                          onChange={(e) => handleSettingChange('hippatizer', 'autoMatch', e.target.checked)}
                          className="rounded accent-blue-600" 
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Create draft patients</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Automatically create draft patients for unmatched forms</p>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={settings.hippatizer.createDrafts}
                          onChange={(e) => handleSettingChange('hippatizer', 'createDrafts', e.target.checked)}
                          className="rounded accent-blue-600" 
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Email notifications</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Notify admins when new forms are received</p>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={settings.hippatizer.emailNotifications}
                          onChange={(e) => handleSettingChange('hippatizer', 'emailNotifications', e.target.checked)}
                          className="rounded accent-blue-600" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      onClick={handleTestApiKey}
                      disabled={testingApiKey || !hasApiKey}
                      title={!hasApiKey ? 'Save an API key first' : 'Send a test form submission notification'}
                    >
                      {testingApiKey ? 'Sending...' : 'Test Connection'}
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50">Staff Access Control</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Configure which staff members can view, match, and publish intake forms
                  </p>
                  {staffMembers.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                      No staff members to configure
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {staffMembers.map((staff) => (
                        <div key={staff.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{staff.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{staff.role}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={staff.access.canView}
                                onChange={(e) => handleStaffAccessChange(staff.id, 'view', e.target.checked)}
                                className="rounded accent-blue-600" 
                              />
                              View Forms
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={staff.access.canMatch}
                                onChange={(e) => handleStaffAccessChange(staff.id, 'match', e.target.checked)}
                                className="rounded accent-blue-600" 
                              />
                              Match Patients
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={staff.access.canPublish}
                                onChange={(e) => handleStaffAccessChange(staff.id, 'publish', e.target.checked)}
                                className="rounded accent-blue-600" 
                              />
                              Publish Drafts
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-slate-50">Recent Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No forms submitted yet</p>
                    <Button variant="outline" size="sm" className="mt-4 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                      View all intake forms
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Patient Messaging ── */}
          {activeTab === 'messaging' && <MessagingSettingsTab />}

          {/* ── Webhook Testing ── */}
          {activeTab === 'webhook-test' && (
            <div className="space-y-6">
              <WebhookTestingComponent />
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

      {/* Floating Save Button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
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
