-- CreateEnum
CREATE TYPE "UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "approval_status" "UserApprovalStatus" NOT NULL DEFAULT 'APPROVED';
