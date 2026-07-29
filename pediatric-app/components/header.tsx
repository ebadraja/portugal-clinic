"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Moon, Sun, Check, CheckCheck, ExternalLink } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface HeaderNotification {
  id: string;
  message: string;
  time: string;
  type: "success" | "error" | "info";
  isRead: boolean;
  actionUrl?: string;
}

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  // Fetch notifications
  useEffect(() => {
    fetchNotifications();
    // Refresh every 10 seconds
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?includeRead=false&limit=10");
      if (res.ok) {
        const data = await res.json();
        const formatted = data.notifications.map((n: any) => ({
          id: n.id,
          message: n.message,
          time: formatTime(new Date(n.createdAt)),
          type: n.type === "error" ? "error" : n.type === "form_submitted" ? "info" : "success",
          isRead: n.isRead,
          actionUrl: n.actionUrl,
        }));
        setNotifications(formatted);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  const handleMarkAsRead = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications/${notificationId}`, { method: "PUT" });
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch(`/api/notifications`, { method: "PATCH" });
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to mark all read:", error);
    }
  };

  const handleNotificationClick = (notification: HeaderNotification) => {
    setShowNotifications(false);
    if (!notification.isRead) {
      fetch(`/api/notifications/${notification.id}`, { method: "PUT" }).then(fetchNotifications);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      router.refresh();
    }
  };

  const titleMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/patients": "Patients",
    "/appointments": "Appointments",
    "/call-logs": "Call Logs",
    "/chat-logs": "Chat Logs",
    "/intake-forms": "Intake Forms",
    "/staff": "Staff",
    "/reports": "Reports",
    "/settings": "Settings",
    "/notifications": "Notifications",
  };

  return (
    <div className="hidden lg:flex fixed top-0 right-0 left-64 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 items-center justify-between px-6 z-40 gap-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-50">{titleMap[pathname || "/dashboard"] || "Dashboard"}</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              fetchNotifications();
            }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
          >
            <Bell className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Loading...
                  </div>
                ) : notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`group px-4 py-3 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors last:border-b-0 ${
                        n.isRead
                          ? "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                          : "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm flex-1 ${n.isRead ? "text-slate-700 dark:text-slate-300" : "font-semibold text-blue-900 dark:text-blue-200"}`}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!n.isRead && (
                            <>
                              <span className="w-2 h-2 bg-blue-500 rounded-full" />
                              <button
                                onClick={(e) => handleMarkAsRead(e, n.id)}
                                title="Mark as read"
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-all"
                              >
                                <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{n.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No unread notifications
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => { setShowNotifications(false); router.push("/notifications"); }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium py-1 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={toggleTheme} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
          {theme === "light" ? <Moon className="h-5 w-5 text-slate-600 dark:text-slate-400" /> : <Sun className="h-5 w-5 text-slate-600 dark:text-slate-400" />}
        </button>
      </div>
    </div>
  );
}
 
