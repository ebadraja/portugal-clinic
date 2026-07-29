import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const s = await prisma.settings.findFirst();

    return NextResponse.json({
      enabled: s?.googleCalEnabled ?? false,
      hasClientId: !!s?.googleCalClientId,
      hasClientSecret: !!s?.googleCalClientSecret,
      calendarId: s?.googleCalCalendarId ?? 'primary',
      syncDirection: s?.googleCalSyncDirection ?? 'read_only',
      connected: !!(s?.googleCalAccessToken && s?.googleCalRefreshToken),
      lastSync: s?.googleCalLastSync ?? null,
    });
  } catch (err) {
    console.error('[GCal_SETTINGS_GET]', err);
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
    const { clientId, clientSecret, calendarId, syncDirection, enabled, disconnect } = body;

    const current = await prisma.settings.findFirst();

    const updateData: Record<string, unknown> = {};

    if (disconnect) {
      updateData.googleCalAccessToken = null;
      updateData.googleCalRefreshToken = null;
      updateData.googleCalTokenExpiry = null;
      updateData.googleCalEnabled = false;
    } else {
      if (clientId?.trim()) updateData.googleCalClientId = encrypt(clientId.trim());
      if (clientSecret?.trim()) updateData.googleCalClientSecret = encrypt(clientSecret.trim());
      if (calendarId !== undefined) updateData.googleCalCalendarId = calendarId || 'primary';
      if (syncDirection !== undefined) updateData.googleCalSyncDirection = syncDirection;
      if (enabled !== undefined) updateData.googleCalEnabled = enabled;
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
        entityId: 'google-calendar',
        changes: { disconnect: !!disconnect, hasClientId: !!clientId, calendarId, syncDirection, enabled },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[GCal_SETTINGS_PUT]', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
