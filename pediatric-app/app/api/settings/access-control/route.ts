import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();

    // Only admins can modify access control
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can modify access control' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, canView, canMatch, canPublish } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update or create access control record
    const access = await prisma.intakeFormAccessControl.upsert({
      where: { userId },
      create: {
        userId,
        canView: canView ?? false,
        canMatch: canMatch ?? false,
        canPublish: canPublish ?? false,
      },
      update: {
        canView: canView ?? undefined,
        canMatch: canMatch ?? undefined,
        canPublish: canPublish ?? undefined,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'intake_form_access_control',
        entityId: userId,
        changes: {
          canView,
          canMatch,
          canPublish,
          targetUser: user.email,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Updated access control for ${user.firstName} ${user.lastName}`,
      access,
    });
  } catch (error) {
    console.error('[ACCESS_CONTROL_UPDATE]', error);
    return NextResponse.json(
      { error: 'Failed to update access control' },
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

    // Only admins can view access control settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can view access control' },
        { status: 403 }
      );
    }

    // Get all staff members with their access control
    const staff = await prisma.user.findMany({
      where: {
        role: {
          in: ['STAFF', 'VIEWER'],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        jobTitle: true,
        intakeFormAccessControl: {
          select: {
            canView: true,
            canMatch: true,
            canPublish: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    return NextResponse.json({
      staff: staff.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        email: s.email,
        role: s.role,
        jobTitle: s.jobTitle,
        access: s.intakeFormAccessControl || {
          canView: false,
          canMatch: false,
          canPublish: false,
        },
      })),
    });
  } catch (error) {
    console.error('[ACCESS_CONTROL_GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch access control settings' },
      { status: 500 }
    );
  }
}
