import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

export const STAGES = ['identified', 'qualifying', 'capture', 'bid_decision', 'proposal', 'submitted', 'won', 'lost'] as const

/** GET /api/pursuits — all pursuits with factors and teaming */
export async function GET() {
  return withAuth(async (user) => {
    const pursuits = await db.pursuit.findMany({
      where: { orgId: user.orgId },
      include: { pwinFactors: true, opportunity: true, teaming: { include: { partner: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    const partners = await db.partner.findMany({ where: { orgId: user.orgId } })
    const org = await db.organization.findUnique({ where: { id: user.orgId } })
    return json({
      pursuits: pursuits.map((p) => ({
        id: p.id, title: p.title, agency: p.agency, stage: p.stage, captureLead: p.captureLead,
        expectedValueCents: p.expectedValueCents, totalValueCents: p.totalValueCents, pwin: p.pwin,
        weightedValueCents: Math.round(p.totalValueCents * p.pwin / 100),
        gateStatus: p.gateStatus, gateDecision: p.gateDecision, gateScore: parseJsonSafe(p.gateScoreJson, []),
        gateApprovedBy: p.gateApprovedBy, gateApprovedAt: p.gateApprovedAt,
        decisionDate: p.decisionDate, winThemes: parseJsonSafe(p.winThemesJson, []),
        noBidReason: p.noBidReason, competitorNote: p.competitorNote,
        opportunityId: p.opportunityId,
        opportunity: p.opportunity ? {
          id: p.opportunity.id, title: p.opportunity.title, solicitationNumber: p.opportunity.solicitationNumber,
          responseDeadline: p.opportunity.responseDeadline, noticeType: p.opportunity.noticeType,
        } : null,
        pwinFactors: p.pwinFactors.map((f) => ({ id: f.id, key: f.key, label: f.label, score: f.score, weight: f.weight, detail: f.detail })),
        teaming: p.teaming.map((t) => ({
          id: t.id, partnerId: t.partnerId, partnerName: t.partner.name, role: t.role,
          worksharePct: t.worksharePct, ndaStatus: t.ndaStatus, taStatus: t.taStatus,
        })),
      })),
      partners: partners.map((p) => ({ id: p.id, name: p.name, certifications: p.certifications, performanceRating: p.performanceRating, capabilities: p.capabilities })),
      stageOrder: STAGES,
      pwinWeights: org ? parseJsonSafe(org.pwinWeightsJson, []) : [],
      gateCriteria: org ? parseJsonSafe(org.gateCriteriaJson, []) : [],
    })
  })
}

/** PATCH /api/pursuits — update pursuit: stage, pwin factors, gate decision, teaming */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const p = await db.pursuit.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!p) return err(404, 'Pursuit not found')

    // Stage change
    if (typeof body.stage === 'string' && STAGES.includes(body.stage as never)) {
      const from = p.stage
      await db.pursuit.update({ where: { id: p.id }, data: { stage: body.stage } })
      await audit(user.orgId, user.name, user.role, 'pursuit.stage_changed', 'pursuit', p.id, p.title, `${from} → ${body.stage}`)
      return json({ ok: true })
    }

    // PWin factor updates (array of {key, score}) → recompute weighted PWin
    if (Array.isArray(body.pwinFactors)) {
      for (const f of body.pwinFactors) {
        if (typeof f.key === 'string' && typeof f.score === 'number') {
          await db.pwinFactor.updateMany({ where: { pursuitId: p.id, key: f.key }, data: { score: Math.max(0, Math.min(100, Math.round(f.score))) } })
        }
      }
      const factors = await db.pwinFactor.findMany({ where: { pursuitId: p.id } })
      const totalW = factors.reduce((s, f) => s + f.weight, 0) || 100
      const pwin = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalW)
      await db.pursuit.update({ where: { id: p.id }, data: { pwin } })
      await audit(user.orgId, user.name, user.role, 'pursuit.pwin_updated', 'pursuit', p.id, p.title, `PWin recalculated to ${pwin}%.`)
      return json({ ok: true, pwin })
    }

    // Gate decision
    if (body.gate) {
      const scores = Array.isArray(body.gate.scores) ? body.gate.scores : []
      const totalW = scores.reduce((s: number, x: { weight: number }) => s + (x.weight ?? 0), 0) || 100
      const avg = scores.length ? scores.reduce((s: number, x: { score: number; weight: number }) => s + x.score * (x.weight ?? 0), 0) / totalW : 0
      const decision = body.gate.decision === 'No-Bid' ? 'No-Bid' : 'Bid'
      const stage = decision === 'Bid' ? 'proposal' : 'lost'
      await db.pursuit.update({
        where: { id: p.id },
        data: {
          gateStatus: decision === 'Bid' ? 'approved' : 'rejected',
          gateDecision: decision,
          gateScoreJson: JSON.stringify(scores),
          gateApprovedBy: user.name,
          gateApprovedAt: new Date(),
          noBidReason: decision === 'No-Bid' ? (body.gate.noBidReason ?? '') : '',
          stage,
          decisionDate: new Date(),
        },
      })
      await audit(user.orgId, user.name, user.role, 'pursuit.gate_decision', 'pursuit', p.id, p.title,
        `${decision} decision recorded (score ${(avg).toFixed(1)}/5.0)${decision === 'No-Bid' && body.gate.noBidReason ? `: ${body.gate.noBidReason}` : ''}.`)
      return json({ ok: true, stage, avgScore: Math.round(avg * 10) / 10 })
    }

    // Win themes / notes
    if (Array.isArray(body.winThemes)) {
      await db.pursuit.update({ where: { id: p.id }, data: { winThemesJson: JSON.stringify(body.winThemes) } })
      return json({ ok: true })
    }
    if (typeof body.competitorNote === 'string') {
      await db.pursuit.update({ where: { id: p.id }, data: { competitorNote: body.competitorNote } })
      return json({ ok: true })
    }

    // Add teaming partner
    if (body.teaming && typeof body.teaming.partnerId === 'string') {
      const partner = await db.partner.findFirst({ where: { id: body.teaming.partnerId, orgId: user.orgId } })
      if (!partner) return err(404, 'Partner not found')
      const ta = await db.teamingAgreement.create({
        data: {
          orgId: user.orgId, pursuitId: p.id, partnerId: partner.id,
          role: body.teaming.role ?? 'Subcontractor',
          worksharePct: body.teaming.worksharePct ?? 20,
          ndaStatus: body.teaming.ndaStatus ?? 'none', taStatus: body.teaming.taStatus ?? 'none',
        },
      })
      await audit(user.orgId, user.name, user.role, 'pursuit.teaming_added', 'pursuit', p.id, p.title,
        `${partner.name} added as ${ta.role} (${ta.worksharePct}% workshare).`)
      return json({ teaming: { ...ta, partnerName: partner.name } })
    }

    return err(400, 'Unknown update')
  })
}

/** POST /api/pursuits — win a pursuit: creates contract + proposal scaffolding */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || body.action !== 'won') return err(400, 'Unknown action')
    const p = await db.pursuit.findFirst({ where: { id: body.id, orgId: user.orgId }, include: { opportunity: true } })
    if (!p) return err(404, 'Pursuit not found')

    await db.pursuit.update({ where: { id: p.id }, data: { stage: 'won' } })
    const contract = await db.contract.create({
      data: {
        orgId: user.orgId, pursuitId: p.id,
        number: 'AWARD-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
        vehicle: 'Direct award', type: 'prime', agency: p.agency,
        coName: 'Contracting officer (to be assigned)', corName: 'COR (to be assigned)',
        status: 'active', awardDate: new Date(), startDate: new Date(), endDate: new Date(Date.now() + 365 * 86400_000),
        popLabel: 'Base period', ceilingCents: p.totalValueCents, obligatedCents: 0, fundedCents: 0,
      },
    })
    await audit(user.orgId, user.name, user.role, 'pursuit.won', 'pursuit', p.id, p.title,
      `Marked won; contract ${contract.number} created. Carry CLINs from pricing when ready.`)
    return json({ contractId: contract.id })
  })
}
