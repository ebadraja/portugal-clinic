/**
 * Gmail OAuth token helper.
 *
 * Returns a valid Gmail access token (refreshing if expired) plus the connected
 * sender address. Reuses the SAME Google OAuth client stored for Google Calendar
 * (googleCalClientId / googleCalClientSecret) — same Cloud project.
 *
 * Used by both the API routes and the email worker (services/emailQueue.ts).
 */

import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto';

export interface GmailToken {
  token: string | null;
  senderEmail: string | null;
  error?: string;
}

export async function getGmailAccessToken(): Promise<GmailToken> {
  const s = await prisma.settings.findFirst();
  if (!s?.gmailAccessToken || !s?.gmailRefreshToken) {
    return { token: null, senderEmail: null, error: 'not_connected' };
  }

  const expiry = s.gmailTokenExpiry;
  const now = new Date();
  const isExpired = !expiry || expiry <= new Date(now.getTime() + 60_000);

  if (!isExpired) {
    return { token: decrypt(s.gmailAccessToken), senderEmail: s.gmailSenderEmail ?? null };
  }

  // Refresh using the shared Google OAuth client credentials
  if (!s.googleCalClientId || !s.googleCalClientSecret) {
    return { token: null, senderEmail: null, error: 'missing_credentials' };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: decrypt(s.googleCalClientId),
      client_secret: decrypt(s.googleCalClientSecret),
      refresh_token: decrypt(s.gmailRefreshToken),
      grant_type: 'refresh_token',
    }),
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.access_token) {
    return { token: null, senderEmail: null, error: 'refresh_failed' };
  }

  await prisma.settings.update({
    where: { id: s.id },
    data: {
      gmailAccessToken: encrypt(data.access_token),
      gmailTokenExpiry: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    },
  });

  return { token: data.access_token, senderEmail: s.gmailSenderEmail ?? null };
}
