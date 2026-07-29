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
      `${baseUrl}/settings?tab=email&error=${error ?? 'no_code'}`
    );
  }

  try {
    const s = await prisma.settings.findFirst();
    if (!s?.googleCalClientId || !s?.googleCalClientSecret) {
      return NextResponse.redirect(
        `${baseUrl}/settings?tab=email&error=missing_credentials`
      );
    }

    const clientId = decrypt(s.googleCalClientId);
    const clientSecret = decrypt(s.googleCalClientSecret);
    const redirectUri = `${baseUrl}/api/auth/gmail/callback`;

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
      console.error('[GMAIL_CALLBACK] Token exchange failed:', tokens);
      return NextResponse.redirect(
        `${baseUrl}/settings?tab=email&error=token_exchange_failed`
      );
    }

    // Capture the connected Google account address to use as the From sender
    let senderEmail: string | null = s.gmailSenderEmail ?? null;
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.email) senderEmail = info.email;
      }
    } catch {
      /* non-fatal — sender can be set manually later */
    }

    await prisma.settings.update({
      where: { id: s.id },
      data: {
        gmailAccessToken: encrypt(tokens.access_token),
        gmailRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : s.gmailRefreshToken,
        gmailTokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        gmailSenderEmail: senderEmail,
        gmailEnabled: true,
      },
    });

    return NextResponse.redirect(`${baseUrl}/settings?tab=email&connected=1`);
  } catch (err) {
    console.error('[GMAIL_CALLBACK]', err);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=email&error=server_error`
    );
  }
}
