import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=google-calendar&error=${error ?? 'no_code'}`
    );
  }

  try {
    const s = await prisma.settings.findFirst();
    if (!s?.googleCalClientId || !s?.googleCalClientSecret) {
      return NextResponse.redirect(
        `${baseUrl}/settings?tab=google-calendar&error=missing_credentials`
      );
    }

    const clientId = decrypt(s.googleCalClientId);
    const clientSecret = decrypt(s.googleCalClientSecret);
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      console.error('[GCal_CALLBACK] Token exchange failed:', tokens);
      return NextResponse.redirect(
        `${baseUrl}/settings?tab=google-calendar&error=token_exchange_failed`
      );
    }

    await prisma.settings.update({
      where: { id: s.id },
      data: {
        googleCalAccessToken: encrypt(tokens.access_token),
        googleCalRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : s.googleCalRefreshToken,
        googleCalTokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        googleCalEnabled: true,
        googleCalLastSync: new Date(),
      },
    });

    return NextResponse.redirect(`${baseUrl}/settings?tab=google-calendar&connected=1`);
  } catch (err) {
    console.error('[GCal_CALLBACK]', err);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=google-calendar&error=server_error`
    );
  }
}
