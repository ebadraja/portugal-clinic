import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [users, auditLogs] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          jobTitle: true,
          isActive: true,
          approvalStatus: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.auditLog.findMany({
        take: 30,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return NextResponse.json({ users, auditLogs });
  } catch (error) {
    console.error('[STAFF_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can invite staff' }, { status: 403 });
    }

    const body = await req.json();
    const { firstName, lastName, email, role, jobTitle, department } = body;

    if (!firstName || !lastName || !email || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    // Use Kid0-18CRM as the default password for invited users
    const passwordHash = await bcrypt.hash('Kid0-18CRM', 12);

    const dbRole = role.toUpperCase() as 'ADMIN' | 'STAFF' | 'VIEWER';

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        role: dbRole,
        jobTitle: jobTitle || department || null,
        isActive: false,
        approvalStatus: 'PENDING',
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'user',
        entityId: newUser.id,
        changes: { invited: email, role: dbRole, by: session.user.email },
      },
    });

    // Notify all ADMIN users (including the inviter)
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true },
      select: { id: true },
    });

    const fullName = `${firstName} ${lastName}`;
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'staff_signup',
        title: 'New Staff Signup Pending Approval',
        message: `${fullName} (${email}) has been invited as ${dbRole}. Approve or reject from Staff Management.`,
        icon: 'user',
        entityType: 'user',
        entityId: newUser.id,
        actionUrl: '/staff',
      })),
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    console.error('[STAFF_POST]', error);
    return NextResponse.json({ error: 'Failed to create staff member' }, { status: 500 });
  }
}
