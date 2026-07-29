import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

// Encryption helpers for API key storage
function encryptApiKey(key: string): string {
  // Simple XOR-based encryption for demonstration
  // In production, use proper encryption like crypto-js or node:crypto
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-key';
  let encrypted = '';
  for (let i = 0; i < key.length; i++) {
    encrypted += String.fromCharCode(key.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
  }
  return Buffer.from(encrypted).toString('base64');
}

function decryptApiKey(encrypted: string): string {
  try {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret-key';
    const decoded = Buffer.from(encrypted, 'base64').toString();
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
    }
    return decrypted;
  } catch (error) {
    return '';
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();

    // Only admins can modify settings
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can modify settings' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { apiKey, enabled, autoMatch, createDrafts, emailNotifications, clearApiKey } = body;

    // Validate API key format if provided
    if (apiKey && apiKey.trim()) {
      // Accept any API key that is at least 10 characters and not just whitespace
      if (apiKey.trim().length < 10) {
        return NextResponse.json(
          { error: 'API key must be at least 10 characters long' },
          { status: 400 }
        );
      }
    }

    // Get current settings to preserve other fields
    const currentSettings = await prisma.settings.findFirst();

    // Determine the API key to store
    let encryptedKey: string | null;
    if (clearApiKey) {
      encryptedKey = null; // Explicit clear
    } else if (apiKey && apiKey.trim()) {
      encryptedKey = encryptApiKey(apiKey); // New key provided
    } else {
      encryptedKey = currentSettings?.hippatizApiKey ?? null; // Keep existing
    }

    const isEnabled = clearApiKey ? false : (enabled ?? currentSettings?.hippatizEnabled ?? false);

    // Upsert settings - create if doesn't exist, update if does
    const updated = await prisma.settings.upsert({
      where: { id: currentSettings?.id || 'singleton' },
      create: {
        id: 'singleton', // Use fixed ID to ensure only one settings record
        hippatizEnabled: isEnabled,
        hippatizApiKey: encryptedKey,
        intakeFormNotifyOnNewForm: emailNotifications ?? true,
        hippatizLastSync: new Date(),
      },
      update: {
        hippatizEnabled: isEnabled,
        hippatizApiKey: encryptedKey,
        intakeFormNotifyOnNewForm: emailNotifications ?? currentSettings?.intakeFormNotifyOnNewForm ?? true,
        hippatizLastSync: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'settings',
        entityId: 'hippatizer',
        changes: {
          enabled,
          hasApiKey: !!apiKey,
          autoMatch,
          createDrafts,
          emailNotifications,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Hippatizer settings saved successfully',
    });
  } catch (error) {
    console.error('[SETTINGS_HIPPATIZER]', error);
    return NextResponse.json(
      { error: 'Failed to save Hippatizer settings' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only admins can view settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can view settings' },
        { status: 403 }
      );
    }

    const settings = await prisma.settings.findFirst();

    // Don't send the encrypted key to frontend, just indicate if one is set
    return NextResponse.json({
      enabled: settings?.hippatizEnabled ?? false,
      hasApiKey: !!settings?.hippatizApiKey,
      accountId: settings?.hippatizAccountId,
      emailNotifications: settings?.intakeFormNotifyOnNewForm ?? true,
      lastSync: settings?.hippatizLastSync,
    });
  } catch (error) {
    console.error('[SETTINGS_HIPPATIZER_GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch Hippatizer settings' },
      { status: 500 }
    );
  }
}
