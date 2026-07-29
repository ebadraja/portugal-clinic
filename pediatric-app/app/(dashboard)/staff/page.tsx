'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import InviteStaffModal from '@/components/invite-staff-modal';
import {
  Users,
  UserPlus,
  Shield,
  Search,
  MoreVertical,
  CheckCircle,
  AlertCircle,
  User,
  Eye,
  Mail,
  Activity,
  Check,
  X,
  Loader2,
  Pencil,
  KeyRound,
  UserX,
  UserCheck,
  Trash2,
} from 'lucide-react';

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'VIEWER';
  jobTitle: string | null;
  isActive: boolean;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  lastLoginAt: string | null;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  userId: string | null;
  user: { firstName: string; lastName: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  timestamp: string;
}

const getRoleColor = (role: 'ADMIN' | 'STAFF' | 'VIEWER') => {
  switch (role) {
    case 'ADMIN':
      return 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-transparent';
    case 'STAFF':
      return 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-transparent';
    case 'VIEWER':
      return 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-transparent';
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case 'LOGIN': return 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300';
    case 'LOGOUT': return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    case 'CREATE': return 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300';
    case 'UPDATE': return 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300';
    case 'DELETE': return 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300';
    case 'READ': return 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300';
    default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  }
};

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

const getInitials = (firstName: string, lastName: string) =>
  `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

export default function StaffManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('staff');

  // Edit dialog
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', jobTitle: '', role: 'STAFF' as StaffUser['role'] });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete confirm dialog
  const [deleteUser, setDeleteUser] = useState<StaffUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast-style feedback
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/staff');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setAuditLogs(data.auditLogs);
      }
    } catch (e) {
      console.error('Failed to fetch staff', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const approvedUsers = users.filter((u) => u.approvalStatus === 'APPROVED');
  const pendingUsers = users.filter((u) => u.approvalStatus === 'PENDING');

  const filteredStaff = approvedUsers.filter((u) => {
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    const matchesSearch =
      name.includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All Roles' || u.role === roleFilter.toUpperCase();
    return matchesSearch && matchesRole;
  });

  const adminCount = approvedUsers.filter((u) => u.role === 'ADMIN').length;

  const handleApprove = async (userId: string) => {
    setActionLoading(userId + '_approve');
    try {
      const res = await fetch(`/api/staff/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) await fetchStaff();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId + '_reject');
    try {
      const res = await fetch(`/api/staff/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (res.ok) { await fetchStaff(); showToast('Staff member rejected.', 'error'); }
    } finally {
      setActionLoading(null);
    }
  };

  const openEdit = (u: StaffUser) => {
    setEditUser(u);
    setEditForm({ firstName: u.firstName, lastName: u.lastName, jobTitle: u.jobTitle ?? '', role: u.role });
    setEditError('');
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError('First and last name are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/staff/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          jobTitle: editForm.jobTitle.trim() || null,
          role: editForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Failed to save.'); return; }
      setEditUser(null);
      await fetchStaff();
      showToast('Profile updated successfully.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleChangeRole = async (userId: string, role: StaffUser['role']) => {
    const res = await fetch(`/api/staff/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) { await fetchStaff(); showToast(`Role updated to ${role}.`); }
    else showToast('Failed to change role.', 'error');
  };

  const handleToggleActive = async (u: StaffUser) => {
    const res = await fetch(`/api/staff/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_active' }),
    });
    if (res.ok) {
      await fetchStaff();
      showToast(`${u.firstName} ${u.lastName} ${u.isActive ? 'deactivated' : 'reactivated'}.`);
    } else showToast('Failed to update status.', 'error');
  };

  const handleResetPassword = async (u: StaffUser) => {
    const res = await fetch(`/api/staff/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password' }),
    });
    if (res.ok) showToast(`Password reset to default for ${u.firstName} ${u.lastName}.`);
    else showToast('Failed to reset password.', 'error');
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/staff/${deleteUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteUser(null);
        setDeleteConfirmText('');
        await fetchStaff();
        showToast(`${deleteUser.firstName} ${deleteUser.lastName} removed from team.`);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to remove.', 'error');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="pt-4 pb-8 space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
            Staff Management
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 gap-2 h-9 md:h-10 text-sm self-start sm:self-auto"
          onClick={() => setShowInviteDialog(true)}
        >
          <UserPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Invite Staff Member</span>
          <span className="sm:hidden">Invite</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Staff</p>
              <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                {loading ? '—' : approvedUsers.length}
              </p>
            </div>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-lg flex-shrink-0">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Admins</p>
              <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                {loading ? '—' : adminCount}
              </p>
            </div>
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-lg flex-shrink-0">
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pending Approval</p>
              <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                {loading ? '—' : pendingUsers.length}
              </p>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-lg flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Activity Logs</p>
              <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                {loading ? '—' : auditLogs.length}
              </p>
            </div>
            <div className="p-2.5 bg-green-50 dark:bg-green-950/40 rounded-lg flex-shrink-0">
              <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-slate-100 dark:bg-slate-800 h-auto gap-1 p-1">
          <TabsTrigger value="staff" className="text-xs md:text-sm py-2">All Staff</TabsTrigger>
          <TabsTrigger value="invites" className="text-xs md:text-sm py-2">
            Pending {pendingUsers.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">{pendingUsers.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs md:text-sm py-2">Activity</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs md:text-sm py-2">Roles</TabsTrigger>
        </TabsList>

        {/* All Staff Tab */}
        <TabsContent value="staff" className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search by name or email..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option>All Roles</option>
                  <option>ADMIN</option>
                  <option>STAFF</option>
                  <option>VIEWER</option>
                </select>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                          </div>
                        </div>
                      </div>
                    ))
                  : filteredStaff.map((u) => (
                      <div key={u.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                              {getInitials(u.firstName, u.lastName)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                                {u.firstName} {u.lastName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={getRoleColor(u.role)}>{u.role}</Badge>
                            <StaffActionsMenu
                              user={u}
                              onEdit={openEdit}
                              onChangeRole={handleChangeRole}
                              onToggleActive={handleToggleActive}
                              onResetPassword={handleResetPassword}
                              onDelete={setDeleteUser}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400">Title</p>
                            <p className="text-slate-700 dark:text-slate-300 font-medium mt-0.5 truncate">{u.jobTitle ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-400">Joined</p>
                            <p className="text-slate-700 dark:text-slate-300 font-medium mt-0.5">{new Date(u.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Role</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Job Title</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Last Login</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Joined</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-700/60">
                            {Array.from({ length: 6 }).map((__, j) => (
                              <td key={j} className="py-3 px-4">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : filteredStaff.map((u) => (
                          <tr key={u.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">
                                  {getInitials(u.firstName, u.lastName)}
                                </div>
                                <div>
                                  <div className="text-slate-900 dark:text-slate-50 font-medium">
                                    {u.firstName} {u.lastName}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={getRoleColor(u.role)}>{u.role}</Badge>
                            </td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-48 truncate">
                              {u.jobTitle ?? '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs">
                              {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'Never'}
                            </td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <StaffActionsMenu
                                user={u}
                                onEdit={openEdit}
                                onChangeRole={handleChangeRole}
                                onToggleActive={handleToggleActive}
                                onResetPassword={handleResetPassword}
                                onDelete={setDeleteUser}
                              />
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
                {!loading && filteredStaff.length === 0 && (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">No staff members found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Approval Tab */}
        <TabsContent value="invites">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : pendingUsers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
                  <p className="font-medium">No pending approvals</p>
                  <p className="text-sm mt-1">All invited staff have been reviewed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-4 border border-amber-200 dark:border-amber-800/60 rounded-lg bg-amber-50 dark:bg-amber-950/20"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {getInitials(u.firstName, u.lastName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {u.firstName} {u.lastName}
                          </p>
                          <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" />
                              {u.email}
                            </span>
                            <span>
                              Role: <Badge className={getRoleColor(u.role)}>{u.role}</Badge>
                            </span>
                            {u.jobTitle && <span>{u.jobTitle}</span>}
                            <span>Invited: {new Date(u.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 ml-4">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                          disabled={!!actionLoading}
                          onClick={() => handleApprove(u.id)}
                        >
                          {actionLoading === u.id + '_approve' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 gap-1.5"
                          disabled={!!actionLoading}
                          onClick={() => handleReject(u.id)}
                        >
                          {actionLoading === u.id + '_reject' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">No activity yet.</p>
              ) : (
                <div className="space-y-4">
                  {auditLogs.map((entry) => {
                    const name = entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : 'System';
                    const initials = entry.user
                      ? getInitials(entry.user.firstName, entry.user.lastName)
                      : 'SY';
                    return (
                      <div key={entry.id} className="flex gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-semibold">
                            {initials}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-900 dark:text-slate-100">
                            <span className="font-medium">{name}</span>{' '}
                            <span className="text-slate-500 dark:text-slate-400 capitalize">
                              {entry.action.toLowerCase()} {entry.entity.replace('_', ' ')}
                            </span>
                          </p>
                          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                            {formatRelativeTime(entry.timestamp)}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getActionColor(entry.action)}`}>
                            {entry.action}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles & Permissions Tab */}
        <TabsContent value="roles">
          <div className="space-y-4">
            <Card className="border-2 border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    <CardTitle>Admin</CardTitle>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Full system access with complete management capabilities
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {['Patients', 'Appointments', 'Call Logs', 'Chat Logs', 'Reports', 'Settings', 'Staff Management', 'Billing'].map((name) => (
                    <div key={name} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-100 dark:border-purple-900/50">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span className="text-sm text-slate-900 dark:text-slate-100">{name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <CardTitle>Staff</CardTitle>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Core operational access for front-line staff
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'Patients', access: true },
                    { name: 'Appointments', access: true },
                    { name: 'Call Logs', access: true },
                    { name: 'Chat Logs', access: true },
                    { name: 'Reports', access: false },
                    { name: 'Settings', access: false },
                    { name: 'Staff Management', access: false },
                    { name: 'Billing', access: false },
                  ].map((perm) => (
                    <div key={perm.name} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-100 dark:border-blue-900/50">
                      {perm.access
                        ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
                      }
                      <span className={`text-sm ${perm.access ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600 line-through'}`}>
                        {perm.name}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Eye className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                  <CardTitle>Viewer</CardTitle>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Read-only access to specific sections
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'Patients (View)', access: true },
                    { name: 'Appointments (View)', access: true },
                    { name: 'Call Logs', access: false },
                    { name: 'Chat Logs', access: false },
                    { name: 'Reports', access: true },
                    { name: 'Settings', access: false },
                    { name: 'Staff Management', access: false },
                    { name: 'Billing', access: true },
                  ].map((perm) => (
                    <div key={perm.name} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      {perm.access
                        ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
                      }
                      <span className={`text-sm ${perm.access ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600 line-through'}`}>
                        {perm.name}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <InviteStaffModal
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onStaffInvited={() => {
          fetchStaff();
          setActiveTab('invites');
        }}
      />

      {/* Edit Staff Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit Staff Profile
            </DialogTitle>
            <DialogDescription>
              Update {editUser?.firstName} {editUser?.lastName}&apos;s details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first">First Name</Label>
                <Input
                  id="edit-first"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last">Last Name</Label>
                <Input
                  id="edit-last"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Job Title</Label>
              <Input
                id="edit-title"
                placeholder="e.g. Registered Nurse"
                value={editForm.jobTitle}
                onChange={(e) => setEditForm((p) => ({ ...p, jobTitle: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={editForm.role}
                onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as StaffUser['role'] }))}
                className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="ADMIN">Admin</option>
                <option value="STAFF">Staff</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>
            {editError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{editError}
              </p>
            )}
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setEditUser(null)} disabled={editSaving}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
                {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => { if (!open) { setDeleteUser(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" /> Remove from Team
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {deleteUser?.firstName} {deleteUser?.lastName}&apos;s account and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              Type <strong>{deleteUser?.email}</strong> to confirm deletion.
            </div>
            <Input
              placeholder={deleteUser?.email}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setDeleteUser(null); setDeleteConfirmText(''); }} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteConfirmText !== deleteUser?.email || deleteLoading}
                onClick={handleDelete}
                className="gap-2"
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove from Team
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4 fade-in-0 ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Actions Dropdown ──────────────────────────────────────────────────────────

interface StaffActionsMenuProps {
  user: StaffUser;
  onEdit: (u: StaffUser) => void;
  onChangeRole: (id: string, role: StaffUser['role']) => void;
  onToggleActive: (u: StaffUser) => void;
  onResetPassword: (u: StaffUser) => void;
  onDelete: (u: StaffUser) => void;
}

function StaffActionsMenu({ user, onEdit, onChangeRole, onToggleActive, onResetPassword, onDelete }: StaffActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors outline-none">
        <MoreVertical className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-slate-500 dark:text-slate-400 font-normal">
            {user.firstName} {user.lastName}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onEdit(user)}>
          <Pencil className="w-4 h-4 mr-2 text-slate-500" />
          Edit Profile
        </DropdownMenuItem>

        {user.role !== 'ADMIN' && (
          <DropdownMenuItem onClick={() => onChangeRole(user.id, 'ADMIN')}>
            <Shield className="w-4 h-4 mr-2 text-purple-500" />
            Make Admin
          </DropdownMenuItem>
        )}
        {user.role !== 'STAFF' && (
          <DropdownMenuItem onClick={() => onChangeRole(user.id, 'STAFF')}>
            <User className="w-4 h-4 mr-2 text-blue-500" />
            Make Staff
          </DropdownMenuItem>
        )}
        {user.role !== 'VIEWER' && (
          <DropdownMenuItem onClick={() => onChangeRole(user.id, 'VIEWER')}>
            <Eye className="w-4 h-4 mr-2 text-slate-400" />
            Make Viewer
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onToggleActive(user)}>
          {user.isActive ? (
            <><UserX className="w-4 h-4 mr-2 text-amber-500" />Deactivate Account</>
          ) : (
            <><UserCheck className="w-4 h-4 mr-2 text-green-500" />Reactivate Account</>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onResetPassword(user)}>
          <KeyRound className="w-4 h-4 mr-2 text-slate-500" />
          Reset Password
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => onDelete(user)}>
          <Trash2 className="w-4 h-4 mr-2" />
          Remove from Team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
