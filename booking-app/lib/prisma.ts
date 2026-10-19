import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

/** TLS for hosted Postgres (Supabase); plain TCP only for a database on this machine (local dev / tests). */
function sslFor(connectionString: string | undefined) {
  try {
    const host = connectionString ? new URL(connectionString).hostname : ""
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false
  } catch {
    // fall through to TLS
  }
  return { rejectUnauthorized: false }
}

function createClient() {
  const connectionString = process.env.DATABASE_URL!
  const max = Number(process.env.DATABASE_POOL_MAX)
  const pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    ...(Number.isInteger(max) && max > 0 && { max }),
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma
