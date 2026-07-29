import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const s = await prisma.settings.findFirst();

    return NextResponse.json({
      enabled: s?.gmailEnabled ?? false,
      connected: !!(s?.gmailAccessToken && s?.gmailRefreshToken),
      senderEmail: s?.gmailSenderEmail ?? null,
      fromName: s?.gmailFromName ?? '',
      // Gmail OAuth reuses the Google Calendar OAuth client (same Cloud project)
      hasGoogleCreds: !!(s?.googleCalClientId && s?.googleCalClientSecret),
    });
  } catch (err) {
    console.error('[EMAIL_SETTINGS_GET]', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { fromName, enabled, disconnect } = body;

    const current = await prisma.settings.findFirst();
    const updateData: Record<string, unknown> = {};

    if (disconnect) {
      updateData.gmailAccessToken = null;
      updateData.gmailRefreshToken = null;
      updateData.gmailTokenExpiry = null;
      updateData.gmailEnabled = false;
    } else {
      if (fromName !== undefined) updateData.gmailFromName = fromName?.trim() || null;
      if (enabled !== undefined) updateData.gmailEnabled = enabled;
    }

    await prisma.settings.upsert({
      where: { id: current?.id ?? 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'settings',
        entityId: 'email',
        changes: { disconnect: !!disconnect, enabled, hasFromName: !!fromName },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[EMAIL_SETTINGS_PUT]', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
