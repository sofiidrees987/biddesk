import { db } from '@/lib/db'
import { json, withAuth, parseJsonSafe } from '@/lib/api'

/** GET /api/reports — computed analytics from live data */
export async function GET() {
  return withAuth(async (user) => {
    const orgId = user.orgId
    const [pursuits, proposals, contracts, deliverables, cpars] = await Promise.all([
      db.pursuit.findMany({ where: { orgId } }),
      db.proposal.findMany({ where: { orgId }, include: { requirements: true } }),
      db.contract.findMany({ where: { orgId }, include: { deliverables: true, clins: true, invoices: true } }),
      db.deliverable.findMany({ where: { contract: { orgId } } }),
      db.cparsEvaluation.findMany({ where: { contract: { orgId } } }),
    ])

    const activeStages = ['identified', 'qualifying', 'capture', 'bid_decision', 'proposal', 'submitted']
    const stageOrder = [...activeStages, 'won', 'lost']

    // Pipeline by stage
    const pipelineByStage = stageOrder.map((stage) => {
      const list = pursuits.filter((p) => p.stage === stage)
      return {
        stage,
        count: list.length,
        valueCents: list.reduce((s, p) => s + p.totalValueCents, 0),
        weightedCents: list.reduce((s, p) => s + Math.round(p.totalValueCents * p.pwin / 100), 0),
      }
    })

    // Win/loss with reasons
    const won = pursuits.filter((p) => p.stage === 'won')
    const lost = pursuits.filter((p) => p.stage === 'lost')
    const noBids = pursuits.filter((p) => p.gateDecision === 'No-Bid')
    const decisions = won.length + lost.length
    const winRate = decisions ? Math.round((won.length / decisions) * 100) : 0

    // Bid volume vs win rate (by quarter, from decision dates)
    const now = new Date()
    const quarters: { label: string; bids: number; wins: number }[] = []
    for (let i = 3; i >= 0; i--) {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - i * 3, 1)
      const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0, 23, 59, 59)
      const inQ = pursuits.filter((p) => p.decisionDate && p.decisionDate >= qStart && p.decisionDate <= qEnd)
      quarters.push({
        label: `Q${Math.floor(qStart.getMonth() / 3) + 1} ${String(qStart.getFullYear()).slice(2)}`,
        bids: inQ.filter((p) => p.stage === 'won' || p.stage === 'lost' || p.stage === 'submitted' || p.stage === 'proposal').length,
        wins: inQ.filter((p) => p.stage === 'won').length,
      })
    }

    // Proposal cycle time (days from creation to submission — using seeded/derived data)
    const cycleTimes = proposals.map((p) => {
      const days = Math.max(15, Math.round((p.dueAt.getTime() - p.createdAt.getTime()) / 86400_000))
      return { title: p.title, days }
    })

    // Contract portfolio and backlog
    const activeContracts = contracts.filter((c) => c.status !== 'closed')
    const backlog = activeContracts.reduce((s, c) => s + Math.max(0, c.ceilingCents - c.obligatedCents), 0)
    const funded = activeContracts.reduce((s, c) => s + c.fundedCents, 0)
    const unfunded = activeContracts.reduce((s, c) => s + Math.max(0, c.obligatedCents - c.fundedCents), 0)

    // Deliverable timeliness
    const onTime = deliverables.filter((d) => ['accepted', 'submitted', 'not_due'].includes(d.status)).length
    const late = deliverables.filter((d) => d.status === 'late').length
    const timeliness = deliverables.length ? Math.round((onTime / deliverables.length) * 100) : 100

    // CPARS trend
    const rated = cpars.filter((c) => c.overallRating)
    const ratingValue: Record<string, number> = { Exceptional: 5, 'Very Good': 4, Satisfactory: 3, Marginal: 2, Unsatisfactory: 1 }
    const cparsTrend = rated
      .map((c) => ({ period: c.periodLabel, rating: c.overallRating, value: ratingValue[c.overallRating] ?? 3 }))
      .sort((a, b) => a.period.localeCompare(b.period))

    // Option and recompete calendar (next 18 months)
    const calendar: { date: string; label: string; kind: string }[] = []
    for (const c of contracts) {
      const opts = parseJsonSafe<unknown[]>(``, []) // options fetched via relation below
      void opts
    }
    const contractsFull = await db.contract.findMany({ where: { orgId }, include: { options: true } })
    for (const c of contractsFull) {
      for (const o of c.options) {
        if (!o.exercised) calendar.push({ date: o.exerciseBy.toISOString(), label: `${c.number} — ${o.label} exercise by`, kind: 'option' })
      }
      if (c.status !== 'closed') {
        const recompete = new Date(c.endDate.getTime() - 120 * 86400_000)
        calendar.push({ date: recompete.toISOString(), label: `${c.number} — recompete planning window opens`, kind: 'recompete' })
      }
    }
    calendar.sort((a, b) => a.date.localeCompare(b.date))

    return json({
      pipelineByStage,
      winLoss: {
        won: won.length, lost: lost.length, noBids: noBids.length, winRate,
        lossReasons: lost.map((l) => ({ title: l.title, reason: l.noBidReason || 'Competitive loss' })),
        noBidReasons: noBids.map((l) => ({ title: l.title, reason: l.noBidReason })),
      },
      quarters,
      cycleTimes,
      avgCycleDays: cycleTimes.length ? Math.round(cycleTimes.reduce((s, c) => s + c.days, 0) / cycleTimes.length) : 0,
      portfolio: {
        activeContracts: activeContracts.length,
        totalValueCents: activeContracts.reduce((s, c) => s + c.ceilingCents, 0),
        backlogCents: backlog, fundedCents: funded, unfundedCents: unfunded,
      },
      deliverables: { total: deliverables.length, onTime, late, timelinessPct: timeliness },
      cparsTrend,
      calendar: calendar.slice(0, 10),
    })
  })
}
