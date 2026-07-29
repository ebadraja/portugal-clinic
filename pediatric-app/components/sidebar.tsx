"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Phone,
  MessageSquare,
  UserCog,
  FileBarChart,
  FileText,
  Settings,
  Stethoscope,
  Menu,
  Moon,
  Sun,
  Bell,
  LogOut,
  Mail,
  Zap,
  Inbox,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { useSession, signOut } from "next-auth/react";

// Set to true to show the Email Automation page in the sidebar once it's ready.
const ENABLE_EMAIL_AUTOMATION = false;

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Patients", href: "/patients", icon: Users },
  { name: "Appointments", href: "/appointments", icon: Calendar },
  { name: "Call Logs", href: "/call-logs", icon: Phone },
  { name: "Chat Logs", href: "/chat-logs", icon: MessageSquare },
  { name: "Messaging", href: "/messaging", icon: Inbox },
  { name: "Intake Forms", href: "/intake-forms", icon: FileText },
  { name: "Email Campaigns", href: "/email/campaigns", icon: Mail },
  ...(ENABLE_EMAIL_AUTOMATION ? [{ name: "Email Automation", href: "/email/automation", icon: Zap }] : []),
  { name: "Staff", href: "/staff", icon: UserCog },
  { name: "Reports", href: "/reports", icon: FileBarChart },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
];

// Tabs that show a "new since you last opened it" badge. Each badge counts only
// items that arrived after the timestamp we stored the last time this browser
// viewed that tab, and clears to 0 when the tab is opened.
const NAV_COUNT_SOURCES: { href: string; url: string }[] = [
  { href: "/appointments", url: "/api/appointments/new-count" },
  { href: "/call-logs", url: "/api/call-logs/new-count" },
  { href: "/chat-logs", url: "/api/chat-logs/new-count" },
  { href: "/intake-forms", url: "/api/intake-forms/new-count" },
  { href: "/patients", url: "/api/patient-drafts/new-count" },
];

const lastSeenKey = (href: string) => `nav-lastseen:${href}`;

// Returns the stored "last viewed" timestamp for a tab. The first time we ever
// look at a tab we seed it with "now" so the pre-existing backlog is never
// counted as new — only genuinely new arrivals after this point show up.
function getLastSeen(href: string): string {
  if (typeof window === "undefined") return new Date().toISOString();
  const stored = window.localStorage.getItem(lastSeenKey(href));
  if (stored) return stored;
  const now = new Date().toISOString();
  window.localStorage.setItem(lastSeenKey(href), now);
  return now;
}

function markSeen(href: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(lastSeenKey(href), new Date().toISOString());
}

function SidebarContent({
  isMobile = false,
  badgeCounts = {},
}: {
  isMobile?: boolean;
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const firstName = session?.user?.firstName ?? ""
  const lastName = session?.user?.lastName ?? ""
  const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "—"
  const initials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?"
  const roleLabel = session?.user?.role
    ? session.user.role.charAt(0) + session.user.role.slice(1).toLowerCase()
    : ""

  return (
    <>
      {/* Logo Area with gradient */}
      <div className={cn(
        "relative border-b border-slate-900/50 bg-gradient-to-b from-slate-900 to-slate-950",
        isMobile ? "p-4" : "p-6"
      )}>
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg flex-shrink-0">
            <Stethoscope className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-base leading-tight text-white">Kids 0-18</h1>
            <p className="text-xs text-slate-400">Integrated Pediatrics</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn(
        "flex-1 space-y-1",
        isMobile ? "px-2 py-3" : "px-3 py-4"
      )}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href === "/messaging" && pathname.startsWith("/messaging"));

          const badgeCount = badgeCounts[item.href] ?? 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                isActive 
                  ? "bg-slate-800 text-white border-l-4 border-blue-500 pl-2" 
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-colors flex-shrink-0",
                isActive ? "text-white" : "text-slate-400"
              )} />
              <span className="flex-1">{item.name}</span>
              {badgeCount > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      {session?.user && (
        <div className={cn(
          "border-t border-slate-800/50",
          isMobile ? "p-3" : "p-4"
        )}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-900 transition-colors group">
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{roleLabel}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface SidebarNotification {
  id: string;
  message: string;
  time: string;
  isRead: boolean;
  actionUrl?: string;
}

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  // Keep the latest pathname available inside the polling closure (which is
  // created once) so the currently-open tab is always treated as "seen".
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<SidebarNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messagingUnreadCount, setMessagingUnreadCount] = useState(0);
  // New-item counts keyed by nav href (appointments, call/chat logs, intake forms)
  const [navCounts, setNavCounts] = useState<Record<string, number>>({});

  const formatTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?includeRead=false&limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(
          data.notifications.map((n: any) => ({
            id: n.id,
            message: n.message,
            time: formatTime(new Date(n.createdAt)),
            isRead: n.isRead,
            actionUrl: n.actionUrl,
          }))
        );
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  };

  const fetchMessagingUnread = async () => {
    try {
      const res = await fetch("/api/messaging/unread-count");
      if (res.ok) {
        const data = await res.json();
        setMessagingUnreadCount(data.unreadCount ?? 0);
      }
    } catch (error) {
      console.error("Failed to fetch messaging unread count:", error);
    }
  };

  // Fetch "new since last opened" counts for the other tabs. Each endpoint is
  // independent — a single failure leaves the others (and the previous value)
  // untouched. The tab the user is currently viewing is kept marked as seen so
  // its badge stays at 0 while open.
  const fetchNavCounts = async () => {
    const currentPath = pathnameRef.current;

    await Promise.all(
      NAV_COUNT_SOURCES.map(async ({ href, url }) => {
        const isActive =
          currentPath === href || currentPath.startsWith(`${href}/`);
        if (isActive) markSeen(href);

        try {
          const since = encodeURIComponent(getLastSeen(href));
          const res = await fetch(`${url}?since=${since}`);
          if (res.ok) {
            const data = await res.json();
            setNavCounts((prev) => ({ ...prev, [href]: data.count ?? 0 }));
          }
        } catch (error) {
          console.error(`Failed to fetch count for ${href}:`, error);
        }
      })
    );
  };

  // When the user opens one of the tracked tabs, immediately mark it seen and
  // clear its badge (the next poll keeps it at 0 while they stay on the page).
  useEffect(() => {
    const active = NAV_COUNT_SOURCES.find(
      (s) => pathname === s.href || pathname.startsWith(`${s.href}/`)
    );
    if (active) {
      markSeen(active.href);
      setNavCounts((prev) => ({ ...prev, [active.href]: 0 }));
    }
  }, [pathname]);

  useEffect(() => {
    fetchNotifications();
    fetchMessagingUnread();
    fetchNavCounts();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchMessagingUnread();
      fetchNavCounts();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = (notification: SidebarNotification) => {
    setShowNotifications(false);
    if (!notification.isRead) {
      fetch(`/api/notifications/${notification.id}`, { method: "PUT" }).then(fetchNotifications);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      router.refresh();
    }
  };

  const badgeCounts: Record<string, number> = {
    ...navCounts,
    "/messaging": messagingUnreadCount,
  };

  return (
    <>
      {/* Desktop Sidebar - Hidden on mobile/tablet */}
      <aside className="hidden lg:flex w-64 bg-slate-950 text-white h-screen fixed left-0 top-0 flex-col border-r border-slate-900/50">
        <SidebarContent badgeCounts={badgeCounts} />
      </aside>

      {/* Mobile Menu Button - Shown on mobile/tablet */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 z-50">
        <Sheet>
          <SheetTrigger className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0">
            <Menu className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-slate-950 text-white p-0 flex flex-col">
            <SidebarContent isMobile={true} badgeCounts={badgeCounts} />
          </SheetContent>
        </Sheet>

        {/* App logo in center */}
        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-slate-900 dark:text-white">Kids 0-18</span>
        </div>

        {/* Top bar actions - theme toggle and notifications */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); fetchNotifications(); }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
            >
              <Bell className="h-6 w-6 text-slate-900 dark:text-slate-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={cn(
                          "px-4 py-3 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors last:border-b-0",
                          notif.isRead
                            ? "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            : "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        )}
                      >
                        <p className={cn(
                          "text-sm",
                          notif.isRead ? "text-slate-900 dark:text-slate-50" : "font-semibold text-blue-900 dark:text-blue-200"
                        )}>{notif.message}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{notif.time}</p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No unread notifications
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => { setShowNotifications(false); router.push("/notifications"); }}
                    className="w-full text-center text-sm text-blue-600 dark:text-blue-400 font-medium py-1"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {theme === "light" ? (
              <Moon className="h-6 w-6 text-slate-900 dark:text-slate-400" />
            ) : (
              <Sun className="h-6 w-6 text-slate-900 dark:text-slate-400" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
