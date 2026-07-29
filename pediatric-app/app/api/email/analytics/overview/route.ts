import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/email/analytics/overview ────────────────────────────────────────
// Params: dateFrom, dateTo (ISO — default: last 30 days)

const SENT_SET   = new Set(['SENT', 'DELIVERED', 'OPENED', 'CLICKED'])
const OPENED_SET = new Set(['OPENED', 'CLICKED'])

function isoDay(ts: Date | string): string {
  return new Date(ts).toISOString().slice(0, 10)
}

// Format an ISO day string to "MMM d"
function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp    = req.nextUrl.searchParams
    const now   = new Date()
    const dateTo   = sp.get('dateTo')   ? new Date(sp.get('dateTo')!)   : now
    const dateFrom = sp.get('dateFrom') ? new Date(sp.get('dateFrom')!) : new Date(now.getTime() - 30 * 86_400_000)

    const periodMs = dateTo.getTime() - dateFrom.getTime()
    const prevFrom = new Date(dateFrom.getTime() - periodMs)

    // ── Fetch in parallel ─────────────────────────────────────────────────────
    const [logs, prevLogs, rules, campaigns] = await Promise.all([
      prisma.emailLog.findMany({
        where:  { createdAt: { gte: dateFrom, lte: dateTo } },
        select: {
          id: true, status: true, type: true,
          sentAt: true, createdAt: true,
          templateId: true, campaignId: true,
          template: { select: { name: true } },
        },
      }),
      prisma.emailLog.findMany({
        where:  { createdAt: { gte: prevFrom, lte: dateFrom } },
        select: { id: true, status: true },
      }),
      prisma.emailAutomationRule.findMany({
        select:  { id: true, name: true, triggerEvent: true, isActive: true, templateId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.emailCampaign.findMany({
        orderBy: { sentAt: 'desc' },
        take:    10,
        select:  { id: true, name: true, status: true, sentAt: true, scheduledAt: true },
      }),
    ])

    // ── KPI counts ────────────────────────────────────────────────────────────
    type Log = typeof logs[number]
    const sentLogs    = logs.filter((l: Log) => SENT_SET.has(l.status))
    const openedLogs  = logs.filter((l: Log) => OPENED_SET.has(l.status))
    const clickedLogs = logs.filter((l: Log) => l.status === 'CLICKED')
    const bouncedLogs = logs.filter((l: Log) => l.status === 'BOUNCED')

    type PrevLog = typeof prevLogs[number]
    const prevSent = prevLogs.filter((l: PrevLog) => SENT_SET.has(l.status)).length

    const totalSent       = sentLogs.length
    const totalSentChange = prevSent > 0 ? parseFloat((((totalSent - prevSent) / prevSent) * 100).toFixed(1)) : 0
    const openRate        = totalSent > 0 ? parseFloat(((openedLogs.length  / totalSent) * 100).toFixed(1)) : 0
    const clickRate       = totalSent > 0 ? parseFloat(((clickedLogs.length / totalSent) * 100).toFixed(1)) : 0
    const bounceRate      = totalSent > 0 ? parseFloat(((bouncedLogs.length / totalSent) * 100).toFixed(1)) : 0

    // Legacy shape counts
    const total        = logs.length
    const sent         = logs.filter((l: Log) => l.status === 'SENT').length
    const delivered    = logs.filter((l: Log) => l.status === 'DELIVERED').length
    const opened       = openedLogs.length
    const clicked      = clickedLogs.length
    const bounced      = bouncedLogs.length
    const failed       = logs.filter((l: Log) => l.status === 'FAILED').length
    const unsubscribed = logs.filter((l: Log) => l.status === 'UNSUBSCRIBED').length
    const deliveryBase = sent + delivered + opened + clicked || 1
    const openBase     = delivered + opened + clicked || 1

    // ── Daily / weekly chart stats ────────────────────────────────────────────
    const daySpan  = Math.ceil(periodMs / 86_400_000)
    const useWeeks = daySpan > 90
    const step     = useWeeks ? 7 : 1

    const bucketKeys: string[] = []
    for (let i = 0; i <= daySpan; i += step) {
      bucketKeys.push(isoDay(new Date(dateFrom.getTime() + i * 86_400_000)))
    }
    const dayMap: Record<string, { sent: number; opened: number; clicked: number }> = {}
    for (const k of bucketKeys) dayMap[k] = { sent: 0, opened: 0, clicked: 0 }

    for (const log of sentLogs) {
      const ts = log.sentAt ?? log.createdAt
      let key: string
      if (useWeeks) {
        const tsMs    = new Date(ts).getTime()
        const weekIdx = Math.floor((tsMs - dateFrom.getTime()) / (7 * 86_400_000))
        const clipped = Math.min(weekIdx, bucketKeys.length - 1)
        key = bucketKeys[Math.max(0, clipped)]
      } else {
        key = isoDay(ts)
      }
      if (!dayMap[key]) continue
      dayMap[key].sent++
      if (OPENED_SET.has(log.status)) dayMap[key].opened++
      if (log.status === 'CLICKED')   dayMap[key].clicked++
    }

    const dailyStats = bucketKeys.map(k => ({ date: fmtDay(k), ...dayMap[k] }))
    const dailyTrend = dailyStats.map(d => ({ date: d.date, count: d.sent }))

    // ── Top performing templates ───────────────────────────────────────────────
    const tmplMap: Record<string, { name: string; sent: number; opened: number; clicked: number }> = {}
    for (const log of sentLogs) {
      if (!log.templateId || !log.template) continue
      if (!tmplMap[log.templateId]) tmplMap[log.templateId] = { name: log.template.name, sent: 0, opened: 0, clicked: 0 }
      tmplMap[log.templateId].sent++
      if (OPENED_SET.has(log.status)) tmplMap[log.templateId].opened++
      if (log.status === 'CLICKED')   tmplMap[log.templateId].clicked++
    }
    const topTemplates = Object.values(tmplMap)
      .map(t => ({
        name:      t.name,
        sent:      t.sent,
        openRate:  t.sent > 0 ? parseFloat(((t.opened  / t.sent) * 100).toFixed(1)) : 0,
        clickRate: t.sent > 0 ? parseFloat(((t.clicked / t.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 8)

    // ── Automation activity (approximate via templateId match) ─────────────────
    // EmailLog has no direct FK to EmailAutomationRule; approximate by templateId
    const automatedByTemplate: Record<string, number> = {}
    for (const log of logs) {
      if (log.type === 'AUTOMATED') {
        automatedByTemplate[log.templateId] = (automatedByTemplate[log.templateId] ?? 0) + 1
      }
    }
    const automationActivity = rules
      .map(r => ({
        id:           r.id,
        name:         r.name,
        triggerEvent: r.triggerEvent,
        isActive:     r.isActive,
        fires:        automatedByTemplate[r.templateId] ?? 0,
      }))
      .sort((a, b) => b.fires - a.fires)
      .slice(0, 8)

    // ── Campaign performance ───────────────────────────────────────────────────
    const campaignStatMap: Record<string, { sent: number; opened: number; clicked: number }> = {}
    for (const log of logs) {
      if (log.type !== 'CAMPAIGN' || !log.campaignId) continue
      if (!campaignStatMap[log.campaignId]) campaignStatMap[log.campaignId] = { sent: 0, opened: 0, clicked: 0 }
      if (SENT_SET.has(log.status))          campaignStatMap[log.campaignId].sent++
      if (OPENED_SET.has(log.status))        campaignStatMap[log.campaignId].opened++
      if (log.status === 'CLICKED')          campaignStatMap[log.campaignId].clicked++
    }
    const recentCampaigns = campaigns.map(c => {
      const s = campaignStatMap[c.id] ?? { sent: 0, opened: 0, clicked: 0 }
      return {
        id:         c.id,
        name:       c.name,
        status:     c.status,
        sentDate:   (c.sentAt ?? c.scheduledAt)?.toISOString() ?? null,
        recipients: s.sent,
        openRate:   s.sent > 0 ? parseFloat(((s.opened  / s.sent) * 100).toFixed(1)) : 0,
        clickRate:  s.sent > 0 ? parseFloat(((s.clicked / s.sent) * 100).toFixed(1)) : 0,
      }
    })

    return NextResponse.json({
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      // ── Rich shape for reports page ─────────────────────────────────────────
      kpis: { totalSent, totalSentChange, openRate, clickRate, bounceRate },
      dailyStats,
      topTemplates,
      automationActivity,
      campaigns: recentCampaigns,
      // ── Legacy shape — kept for existing consumers ──────────────────────────
      totals: { total, sent, delivered, opened, clicked, bounced, failed, unsubscribed },
      rates: {
        deliveryRate:    Math.round((delivered / deliveryBase) * 100),
        openRate:        Math.round((opened    / openBase)     * 100),
        clickToOpenRate: Math.round((clicked   / (opened || 1)) * 100),
        bounceRate:      Math.round((bounced   / deliveryBase)  * 100),
      },
      dailyTrend,
    })
  } catch (error) {
    console.error('[GET /api/email/analytics/overview]', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
