import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_TYPES = new Set([
  "refill_request", "callback_request", "intake_forms_requested", "transfer_context",
  "appointment_booked", "appointment_cancelled", "call_received", "chat_received", "form_submitted",
  "patient_matched", "draft_approved", "error", "info",
  "new_message", "message_assigned", "conversation_escalated", "broadcast_completed",
])
const ALLOWED_STATUSES = new Set(["pending", "acknowledged", "completed"])

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit       = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const includeRead = searchParams.get('includeRead') === 'true';
    const typeParam   = searchParams.get('type') ?? '';
    const statusParam = searchParams.get('status') ?? '';

    const typeFilter   = ALLOWED_TYPES.has(typeParam)   ? typeParam   : null;
    const statusFilter = ALLOWED_STATUSES.has(statusParam) ? statusParam : null;

    const userId = session.user.id;

    // Build dynamic query with validated parameters
    const conditions: string[] = ['user_id = $1'];
    const queryParams: unknown[] = [userId];

    if (!includeRead) {
      conditions.push('is_read = false');
    }
    if (typeFilter) {
      queryParams.push(typeFilter);
      conditions.push(`type = $${queryParams.length}`);
    }
    if (statusFilter) {
      queryParams.push(statusFilter);
      conditions.push(`notif_status = $${queryParams.length}`);
    }

    queryParams.push(limit);
    const sql = `
      SELECT id, type, title, message, icon, is_read, entity_type, entity_id,
             action_url, created_at, notif_status
      FROM notifications
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length}
    `;

    type NotifRow = {
      id: string; type: string; title: string; message: string;
      icon: string | null; is_read: boolean; entity_type: string | null;
      entity_id: string | null; action_url: string | null; created_at: Date;
      notif_status: string;
    };

    // Fall back to query without notif_status if the migration hasn't run yet
    let notifications: NotifRow[];
    try {
      notifications = await prisma.$queryRawUnsafe(sql, ...queryParams);
    } catch {
      const fallbackSql = sql.replace(', notif_status', '');
      const rows: Omit<NotifRow, 'notif_status'>[] = await prisma.$queryRawUnsafe(fallbackSql, ...queryParams);
      notifications = rows.map(r => ({ ...r, notif_status: 'pending' }));
    }

    const countResult: { count: bigint }[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      userId
    );
    const unreadCount = Number(countResult[0]?.count ?? 0);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        icon: n.icon,
        isRead: n.is_read,
        entityType: n.entity_type,
        entityId: n.entity_id,
        actionUrl: n.action_url,
        createdAt: n.created_at,
        notifStatus: n.notif_status,
      })),
      unreadCount,
      total: notifications.length,
    });
  } catch (error) {
    console.error('[NOTIFICATIONS_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE notifications SET is_read = true, read_at = ${now}
      WHERE user_id = ${userId} AND is_read = false
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS_MARK_ALL_READ]', error);
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, type, title, message, icon, entityType, entityId, actionUrl } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const notification = await prisma.notification.create({
      data: { userId, type, title, message, icon: icon || typeToIcon(type), entityType, entityId, actionUrl },
    });

    return NextResponse.json(
      { success: true, notification: { id: notification.id, type: notification.type, title: notification.title } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[NOTIFICATIONS_POST]', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}

function typeToIcon(type: string): string {
  const iconMap: Record<string, string> = {
    form_submitted: 'form', patient_matched: 'check', draft_approved: 'check',
    warning: 'alert', error: 'error',
    new_message: 'message', message_assigned: 'message',
    chat_received: 'message', call_received: 'phone',
  };
  return iconMap[type] || 'info';
}
