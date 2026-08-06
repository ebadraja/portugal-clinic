import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await prisma.user.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', isActive: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          changes: { approvalStatus: 'APPROVED', approvedBy: session.user.email },
        },
      });

      // Notify all admins that user was approved
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true },
        select: { id: true },
      });

      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'staff_approved',
          title: 'Staff Member Approved',
          message: `${target.firstName} ${target.lastName} (${target.email}) has been approved and can now log in.`,
          icon: 'check',
          entityType: 'user',
          entityId: id,
          actionUrl: '/staff',
        })),
      });

      return NextResponse.json({ success: true, message: `${target.firstName} ${target.lastName} has been approved` });
    }

    if (action === 'reject') {
      const { reason } = body;
      await prisma.user.update({
        where: { id },
        data: { approvalStatus: 'REJECTED', isActive: false },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          changes: { approvalStatus: 'REJECTED', rejectedBy: session.user.email, reason: reason || 'No reason provided' },
        },
      });

      return NextResponse.json({ success: true, message: `${target.firstName} ${target.lastName} has been rejected` });
    }

    if (action === 'reset_password') {
      const newHash = await bcrypt.hash('Kid0-18CRM', 12);
      await prisma.user.update({ where: { id }, data: { passwordHash: newHash } });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          changes: { action: 'password_reset', resetBy: session.user.email },
        },
      });
      return NextResponse.json({ success: true, message: `Password reset to default for ${target.firstName} ${target.lastName}` });
    }

    if (action === 'toggle_active') {
      const updated = await prisma.user.update({
        where: { id },
        data: { isActive: !target.isActive },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          changes: { isActive: updated.isActive, changedBy: session.user.email },
        },
      });
      return NextResponse.json({ success: true, user: updated });
    }

    // Generic update (role, jobTitle, isActive, firstName, lastName)
    const { role, jobTitle, isActive, firstName, lastName } = body;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(role && { role: role.toUpperCase() }),
        ...(jobTitle !== undefined && { jobTitle }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'user',
        entityId: id,
        changes: { role, jobTitle, isActive },
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error('[STAFF_PUT]', error);
    return NextResponse.json({ error: 'Failed to update staff member' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (id === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entity: 'user',
        entityId: id,
        changes: { deletedEmail: target.email, deletedBy: session.user.email },
      },
    });

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[STAFF_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete staff member' }, { status: 500 });
  }
}
