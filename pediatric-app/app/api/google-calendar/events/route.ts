import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto';
import { NextRequest, NextResponse } from 'next/server';

async function getValidToken(): Promise<{ token: string | null; error?: string }> {
  const s = await prisma.settings.findFirst();
  if (!s?.googleCalAccessToken || !s?.googleCalRefreshToken) {
    return { token: null, error: 'not_connected' };
  }

  const expiry = s.googleCalTokenExpiry;
  const now = new Date();
  const isExpired = !expiry || expiry <= new Date(now.getTime() + 60_000);

  if (!isExpired) {
    return { token: decrypt(s.googleCalAccessToken) };
  }

  // Refresh
  if (!s.googleCalClientId || !s.googleCalClientSecret) {
    return { token: null, error: 'missing_credentials' };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: decrypt(s.googleCalClientId),
      client_secret: decrypt(s.googleCalClientSecret),
      refresh_token: decrypt(s.googleCalRefreshToken),
      grant_type: 'refresh_token',
    }),
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.access_token) {
    return { token: null, error: 'refresh_failed' };
  }

  await prisma.settings.update({
    where: { id: s.id },
    data: {
      googleCalAccessToken: encrypt(data.access_token),
      googleCalTokenExpiry: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      googleCalLastSync: new Date(),
    },
  });

  return { token: data.access_token };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const s = await prisma.settings.findFirst();
    if (!s?.googleCalEnabled) {
      return NextResponse.json({ events: [], connected: false });
    }

    const { token, error } = await getValidToken();
    if (!token) {
      return NextResponse.json({ events: [], connected: false, error });
    }

    const { searchParams } = new URL(req.url);
    const timeMin = searchParams.get('timeMin') ?? new Date().toISOString();
    const timeMax = searchParams.get('timeMax') ?? new Date(Date.now() + 7 * 86_400_000).toISOString();
    const calendarId = encodeURIComponent(s.googleCalCalendarId ?? 'primary');

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!gcalRes.ok) {
      const err = await gcalRes.json();
      console.error('[GCal_EVENTS]', err);
      return NextResponse.json({ events: [], connected: true, error: 'fetch_failed' });
    }

    const data = await gcalRes.json();
    const events = (data.items ?? []).map((e: any) => ({
      id: e.id,
      summary: e.summary ?? '(No title)',
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      allDay: !e.start?.dateTime,
      htmlLink: e.htmlLink,
      colorId: e.colorId,
    }));

    return NextResponse.json({ events, connected: true });
  } catch (err) {
    console.error('[GCal_EVENTS]', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
