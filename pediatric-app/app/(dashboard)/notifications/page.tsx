"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, CheckCircle, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  notifStatus: string;
  actionUrl?: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  refill_request:         "Refill Request",
  callback_request:       "Callback Request",
  intake_forms_requested: "Intake Forms",
  transfer_context:       "Transfer",
  appointment_booked:     "Appt Booked",
  appointment_cancelled:  "Appt Cancelled",
  call_received:          "Call Received",
  form_submitted:         "Form Submitted",
  patient_matched:        "Patient Matched",
  draft_approved:         "Draft Approved",
};

const TYPE_COLORS: Record<string, string> = {
  refill_request:         "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  callback_request:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  intake_forms_requested: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  transfer_context:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  appointment_booked:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  appointment_cancelled:  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  call_received:          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  form_submitted:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  patient_matched:        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_COLORS: Record<string, string> = {
  pending:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  acknowledged: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

function derivePriority(type: string, message: string): { label: string; color: string } {
  if (type === "transfer_context") {
    return { label: "Urgent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  }
  if (type === "refill_request" && /urgent: yes/i.test(message)) {
    return { label: "High", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
  }
  if (type === "callback_request" && /urgency: urgent/i.test(message)) {
    return { label: "High", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
  }
  if (type === "appointment_cancelled") {
    return { label: "Normal", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  }
  if (type === "call_received") {
    return { label: "Low", color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500" };
  }
  return { label: "Normal", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", includeRead: "true" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        let list: Notification[] = data.notifications;
        if (readFilter === "unread") list = list.filter((n) => !n.isRead);
        setNotifications(list);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, readFilter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PUT" });
    fetchNotifications();
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    fetchNotifications();
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, notifStatus: status } : n))
      );
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  };

  const deleteNotif = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleView = (n: Notification) => {
    if (!n.isRead) markRead(n.id);
    if (n.actionUrl) {
      router.push(n.actionUrl);
      router.refresh();
    }
  };

  return (
    <div className="pt-4 pb-8 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Notifications
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            All system notifications and action items
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={readFilter} onValueChange={(v) => setReadFilter(v ?? "all")}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="refill_request">Refill Request</SelectItem>
            <SelectItem value="callback_request">Callback Request</SelectItem>
            <SelectItem value="intake_forms_requested">Intake Forms</SelectItem>
            <SelectItem value="transfer_context">Transfer</SelectItem>
            <SelectItem value="appointment_booked">Appt Booked</SelectItem>
            <SelectItem value="appointment_cancelled">Appt Cancelled</SelectItem>
            <SelectItem value="call_received">Call Received</SelectItem>
            <SelectItem value="form_submitted">Form Submitted</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        {(typeFilter !== "all" || statusFilter !== "all" || readFilter !== "all") && (
          <button
            onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setReadFilter("all"); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-36">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-52">Title</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Message</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-24">Priority</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-32">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-40">Created At</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading…
                  </td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Bell className="h-10 w-10 opacity-20 mx-auto mb-2 text-slate-500" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No notifications found</p>
                  </td>
                </tr>
              ) : (
                notifications.map((n) => {
                  const priority = derivePriority(n.type, n.message);
                  const isUpdating = updating[n.id];
                  return (
                    <tr
                      key={n.id}
                      className={`border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors ${
                        n.isRead
                          ? "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          : "bg-blue-50/50 dark:bg-blue-900/5 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                      }`}
                    >
                      {/* Type */}
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-xs px-1.5 py-0 border-0 whitespace-nowrap ${
                            TYPE_COLORS[n.type] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {TYPE_LABELS[n.type] ?? n.type}
                        </Badge>
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3">
                        <span
                          className={`leading-snug ${
                            n.isRead
                              ? "text-slate-700 dark:text-slate-300"
                              : "font-semibold text-slate-900 dark:text-slate-50"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.isRead && (
                          <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" />
                        )}
                      </td>

                      {/* Message */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 leading-relaxed">
                        {n.message}
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3">
                        <Badge className={`text-xs px-1.5 py-0 border-0 ${priority.color}`}>
                          {priority.label}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-xs px-1.5 py-0 border-0 capitalize ${
                            STATUS_COLORS[n.notifStatus] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {n.notifStatus}
                        </Badge>
                      </td>

                      {/* Created At */}
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(n.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {n.notifStatus === "pending" && (
                            <button
                              onClick={() => updateStatus(n.id, "acknowledged")}
                              disabled={isUpdating}
                              title="Mark acknowledged"
                              className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 disabled:opacity-50 transition-colors"
                            >
                              {isUpdating
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Check className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {(n.notifStatus === "pending" || n.notifStatus === "acknowledged") && (
                            <button
                              onClick={() => updateStatus(n.id, "completed")}
                              disabled={isUpdating}
                              title="Mark completed"
                              className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 disabled:opacity-50 transition-colors"
                            >
                              {isUpdating
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <CheckCircle className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {n.actionUrl && (
                            <button
                              onClick={() => handleView(n)}
                              title="View"
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotif(n.id)}
                            title="Delete"
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
