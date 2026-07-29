import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { NextRequest, NextResponse } from 'next/server';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const s = await prisma.settings.findFirst();
    if (!s?.googleCalClientId) {
      return NextResponse.json({ error: 'Google Calendar Client ID not configured' }, { status: 400 });
    }

    const clientId = decrypt(s.googleCalClientId);
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    });

    return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (err) {
    console.error('[GCal_OAUTH_INIT]', err);
    return NextResponse.json({ error: 'OAuth initiation failed' }, { status: 500 });
  }
}
