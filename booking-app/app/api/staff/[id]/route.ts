import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { issuePasswordToken } from '@/lib/auth/passwordTokens';
import { emailDeliveryConfigured, sendPasswordLinkEmail } from '@/lib/auth/passwordEmails';

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
      // One-time reset link instead of a shared default password. The current
      // password keeps working until the link is used.
      const { url, expiresAt } = await issuePasswordToken(id, 'reset');
      const emailSent = (await emailDeliveryConfigured())
        ? await sendPasswordLinkEmail({ to: target.email, firstName: target.firstName, url, purpose: 'reset' })
        : false;
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          changes: { action: 'password_reset_link_issued', resetBy: session.user.email, emailSent },
        },
      });
      return NextResponse.json({
        success: true,
        emailSent,
        resetUrl: emailSent ? undefined : url,
        expiresAt: expiresAt.toISOString(),
        message: emailSent
          ? `Reset link emailed to ${target.firstName} ${target.lastName}`
          : `Email is not configured — share this one-time link with ${target.firstName} ${target.lastName}`,
      });
    }

    if (action === 'reset_2fa') {
      // Lost or replaced phone: turn two-factor off so the person can sign in and set it up again.
      await prisma.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null } });
      await prisma.auditLog.create({
        data: { userId: session.user.id, action: 'UPDATE', entity: 'user', entityId: id, changes: { action: 'two_factor_reset', resetBy: session.user.email } },
      });
      return NextResponse.json({ success: true, message: `Two-factor turned off for ${target.firstName} ${target.lastName}. They can set it up again from Account.` });
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
    const actorId = session.user.id;

    // Prevent self-deletion
    if (id === actorId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Optional FKs → null
      await tx.patient.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.appointment.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.auditLog.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.intakeForm.updateMany({ where: { processedById: id }, data: { processedById: null } });
      await tx.patientDraft.updateMany({ where: { publishedById: id }, data: { publishedById: null } });
      await tx.conversation.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.message.updateMany({ where: { senderId: id }, data: { senderId: null } });

      // Required FKs → reassign to the admin performing the delete
      await tx.patientNote.updateMany({ where: { authorId: id }, data: { authorId: actorId } });
      await tx.patientDraft.updateMany({ where: { createdById: id }, data: { createdById: actorId } });
      await tx.emailCampaign.updateMany({ where: { createdById: id }, data: { createdById: actorId } });
      await tx.messageTemplate.updateMany({ where: { createdById: id }, data: { createdById: actorId } });
      await tx.broadcast.updateMany({ where: { createdById: id }, data: { createdById: actorId } });

      // Owned rows with cascade-capable deletes
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.intakeFormAccessControl.deleteMany({ where: { userId: id } });
      await tx.sharedInboxMember.deleteMany({ where: { userId: id } });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'DELETE',
          entity: 'user',
          entityId: id,
          changes: { deletedEmail: target.email, deletedBy: session.user.email },
        },
      });

      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[STAFF_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete staff member' }, { status: 500 });
  }
}
