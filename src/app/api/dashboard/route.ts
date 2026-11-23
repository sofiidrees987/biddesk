import { db } from '@/lib/db'
import { json, withAuth, parseJsonSafe } from '@/lib/api'

/** GET /api/dashboard — aggregated dashboard data */
export async function GET() {
  return withAuth(async (user) => {
    const orgId = user.orgId
    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 86400_000)

    const [myTasks, pursuits, proposals, contracts, opps, notifications, org] = await Promise.all([
      db.task.findMany({
        where: { orgId, assigneeId: user.id, status: 'open' },
        orderBy: { dueDate: 'asc' },
      }),
      db.pursuit.findMany({ where: { orgId }, include: { pwinFactors: true, opportunity: true }, orderBy: { updatedAt: 'desc' } }),
      db.proposal.findMany({ where: { orgId }, include: { requirements: true, sections: true, pursuit: true }, orderBy: { dueAt: 'asc' } }),
      db.contract.findMany({ where: { orgId }, include: { deliverables: true, options: true, cpars: true, modifications: true } }),
      db.opportunity.findMany({ where: { orgId, status: 'new', archived: false }, orderBy: { matchScore: 'desc' }, take: 12 }),
      db.notification.findMany({ where: { orgId, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.organization.findUnique({ where: { id: orgId } }),
    ])

    // Timeline: next 30 days of dated events
    const timeline: { date: string; kind: string; label: string; recordType: string; recordId: string }[] = []
    for (const p of proposals) {
      if (p.dueAt >= now && p.dueAt <= in30 && !['won', 'lost'].includes(p.status)) {
        timeline.push({ date: p.dueAt.toISOString(), kind: 'solicitation', label: `${p.title} — proposal due`, recordType: 'proposal', recordId: p.id })
      }
    }
    for (const c of contracts) {
      for (const d of c.deliverables) {
        if (d.nextDue && d.nextDue >= now && d.nextDue <= in30) {
          timeline.push({ date: d.nextDue.toISOString(), kind: 'deliverable', label: `${d.title} — ${c.number}`, recordType: 'contract', recordId: c.id })
        }
      }
      for (const o of c.options) {
        if (!o.exercised && o.preliminaryNoticeBy && o.preliminaryNoticeBy >= now && o.preliminaryNoticeBy <= in30) {
          timeline.push({ date: o.preliminaryNoticeBy.toISOString(), kind: 'option', label: `${c.number} ${o.label} — preliminary notice`, recordType: 'contract', recordId: c.id })
        }
        if (!o.exercised && o.exerciseBy >= now && o.exerciseBy <= in30) {
          timeline.push({ date: o.exerciseBy.toISOString(), kind: 'option', label: `${c.number} ${o.label} — exercise by`, recordType: 'contract', recordId: c.id })
        }
      }
      for (const cp of c.cpars) {
        if (cp.responseDue && cp.responseDue >= now && cp.responseDue <= in30) {
          timeline.push({ date: cp.responseDue.toISOString(), kind: 'cpars', label: `${c.number} CPARS ${cp.periodLabel} — response due`, recordType: 'contract', recordId: c.id })
        }
      }
    }
    for (const pu of pursuits) {
      if (pu.decisionDate && pu.decisionDate >= now && pu.decisionDate <= in30) {
        timeline.push({ date: pu.decisionDate.toISOString(), kind: 'gate', label: `${pu.title} — bid decision`, recordType: 'pursuit', recordId: pu.id })
      }
    }
    timeline.sort((a, b) => a.date.localeCompare(b.date))

    // Pipeline by stage (active only)
    const activeStages = ['identified', 'qualifying', 'capture', 'bid_decision', 'proposal', 'submitted']
    const pipelineByStage = activeStages.map((stage) => {
      const list = pursuits.filter((p) => p.stage === stage)
      return {
        stage,
        count: list.length,
        valueCents: list.reduce((s, p) => s + p.totalValueCents, 0),
        weightedCents: list.reduce((s, p) => s + Math.round(p.totalValueCents * p.pwin / 100), 0),
      }
    })
    const activePursuits = pursuits.filter((p) => activeStages.includes(p.stage))
    const weightedPipeline = activePursuits.reduce((s, p) => s + Math.round(p.totalValueCents * p.pwin / 100), 0)

    // Proposals in progress with coverage
    const proposalsInProgress = proposals
      .filter((p) => ['intake', 'requirements', 'writing', 'review'].includes(p.status))
      .map((p) => {
        const total = p.requirements.filter((r) => r.status !== 'rejected').length
        const confirmed = p.requirements.filter((r) => r.status === 'confirmed' || r.status === 'edited').length
        const written = p.sections.filter((s) => s.status === 'final' || s.status === 'in_review').length
        const sectionsTotal = p.sections.length
        const daysRemaining = Math.ceil((p.dueAt.getTime() - now.getTime()) / 86400_000)
        return {
          id: p.id, title: p.title, status: p.status, dueAt: p.dueAt, daysRemaining,
          coveragePct: total ? Math.round((confirmed / total) * 100) : 0,
          sectionsWritten: written, sectionsTotal,
        }
      })

    // Contracts needing action
    const contractsNeedingAction = contracts
      .filter((c) => {
        const lateDeliverable = c.deliverables.some((d) => d.status === 'late')
        const dueDeliverable = c.deliverables.some((d) => d.status === 'due_soon')
        const optionSoon = c.options.some((o) => !o.exercised && o.exerciseBy <= new Date(now.getTime() + 60 * 86400_000))
        const cparsPending = c.cpars.some((cp) => cp.status === 'pending' && cp.responseDue)
        return c.status !== 'closed' && (lateDeliverable || dueDeliverable || optionSoon || cparsPending)
      })
      .map((c) => ({
        id: c.id, number: c.number, agency: c.agency, status: c.status,
        issues: [
          ...c.deliverables.filter((d) => d.status === 'late').map((d) => `Deliverable late: ${d.title}`),
          ...c.deliverables.filter((d) => d.status === 'due_soon').map((d) => `Due soon: ${d.title}`),
          ...c.options.filter((o) => !o.exercised && o.exerciseBy <= new Date(now.getTime() + 60 * 86400_000)).map((o) => `${o.label} exercise window open`),
          ...c.cpars.filter((cp) => cp.status === 'pending').map((cp) => `CPARS ${cp.periodLabel} response pending`),
        ],
      }))

    const recommended = opps
      .filter((o) => o.matchScore >= 55)
      .slice(0, 4)
      .map((o) => ({
        id: o.id, title: o.title, agency: o.agency, matchScore: o.matchScore,
        responseDeadline: o.responseDeadline, valueLabel: o.valueLabel,
        matchFactors: parseJsonSafe(o.matchFactorsJson, []).slice(0, 3),
      }))

    return json({
      myTasks: myTasks.map((t) => ({
        id: t.id, title: t.title, detail: t.detail, dueDate: t.dueDate, priority: t.priority,
        recordType: t.recordType, recordId: t.recordId, recordLabel: t.recordLabel,
      })),
      timeline: timeline.slice(0, 10),
      pipelineByStage,
      pipelineSummary: {
        activeCount: activePursuits.length,
        valueCents: activePursuits.reduce((s, p) => s + p.totalValueCents, 0),
        weightedCents: weightedPipeline,
      },
      proposalsInProgress,
      contractsNeedingAction,
      recommended,
      unreadNotifications: notifications.filter((n) => !n.read).length,
      org: org ? { name: org.name, firstRunDone: org.firstRunDone, walkthroughSeen: org.walkthroughSeen } : null,
    })
  })
}
