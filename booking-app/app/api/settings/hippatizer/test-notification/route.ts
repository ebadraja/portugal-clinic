import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const userId = session.user.id;
    const id = `notif_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    // Use raw SQL to bypass any stale Prisma model accessor (the notification
    // model was added after the client was compiled — $executeRaw always works).
    await prisma.$executeRaw`
      INSERT INTO notifications (id, user_id, type, title, message, icon, entity_type, entity_id, is_read, action_url, created_at)
      VALUES (${id}, ${userId}, 'form_submitted', 'New Intake Form Received (Test)',
              'Test: A new patient intake form was submitted and is ready for review',
              'form', 'intake_form', 'test', false, '/intake-forms', ${now})
    `;

    return NextResponse.json({ success: true, notificationId: id });
  } catch (error) {
    console.error('[HIPPATIZER_TEST_NOTIFICATION]', error);
    return NextResponse.json({
      error: 'Failed to create notification',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
