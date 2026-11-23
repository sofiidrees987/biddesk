import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

/** GET /api/opportunities — list with optional filters (q, status, noticeType, setAside, naics) */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').toLowerCase()
    const status = sp.get('status') ?? ''
    const noticeType = sp.get('noticeType') ?? ''
    const setAside = sp.get('setAside') ?? ''
    const naics = sp.get('naics') ?? ''

    let opps = await db.opportunity.findMany({
      where: { orgId: user.orgId, archived: false },
      orderBy: [{ matchScore: 'desc' }],
    })

    if (q) {
      opps = opps.filter((o) =>
        [o.title, o.agency, o.solicitationNumber, o.office, o.psc, o.naics, o.popState]
          .join(' ').toLowerCase().includes(q))
    }
    if (status) opps = opps.filter((o) => o.status === status)
    if (noticeType) opps = opps.filter((o) => o.noticeType === noticeType)
    if (setAside) opps = opps.filter((o) => o.setAside === setAside)
    if (naics) opps = opps.filter((o) => o.naics === naics)

    const savedSearches = await db.savedSearch.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'asc' },
    })

    return json({
      opportunities: opps.map((o) => ({
        id: o.id, source: o.source, noticeType: o.noticeType, title: o.title,
        solicitationNumber: o.solicitationNumber, agency: o.agency, subTier: o.subTier, office: o.office,
        postedDate: o.postedDate, responseDeadline: o.responseDeadline, naics: o.naics, psc: o.psc,
        setAside: o.setAside, popCity: o.popCity, popState: o.popState, description: o.description,
        estimatedValueCents: o.estimatedValueCents, valueLabel: o.valueLabel,
        matchScore: o.matchScore, matchFactors: parseJsonSafe(o.matchFactorsJson, []),
        status: o.status, dismissedReason: o.dismissedReason,
      })),
      savedSearches: savedSearches.map((s) => ({
        id: s.id, name: s.name, criteria: parseJsonSafe(s.criteriaJson, {}),
        alertsEnabled: s.alertsEnabled, digest: s.digest,
      })),
      facets: {
        noticeTypes: [...new Set(opps.map((o) => o.noticeType))].sort(),
        setAsides: [...new Set(opps.map((o) => o.setAside))].sort(),
        naics: [...new Set(opps.map((o) => o.naics))].sort(),
        agencies: [...new Set(opps.map((o) => o.agency))].sort(),
      },
    })
  })
}

/** POST /api/opportunities — actions: track | dismiss | restore | addManual */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.action !== 'string') return err(400, 'Invalid request')

    if (body.action === 'track') {
      const opp = await db.opportunity.findFirst({ where: { id: body.id, orgId: user.orgId } })
      if (!opp) return err(404, 'Not found')
      const exists = await db.pursuit.findFirst({ where: { opportunityId: opp.id, orgId: user.orgId } })
      if (exists) {
        await db.opportunity.update({ where: { id: opp.id }, data: { status: 'tracked' } })
        return json({ pursuit: exists })
      }
      const factors = parseJsonSafe<{ key: string; label: string; score: number; weight: number }[]>(opp.matchFactorsJson, [])
      const pursuit = await db.pursuit.create({
        data: {
          orgId: user.orgId, opportunityId: opp.id, title: opp.title, agency: opp.agency,
          stage: 'identified', captureLead: user.name,
          expectedValueCents: Math.round((opp.estimatedValueCents ?? 0) * 0.8),
          totalValueCents: opp.estimatedValueCents ?? 0,
          pwin: Math.min(45, Math.round(opp.matchScore * 0.5)),
          gateStatus: 'pending', gateDecision: '', gateApprovedBy: '',
          noBidReason: '', competitorNote: '',
          pwinFactors: {
            create: [
              { key: 'customer_relationship', label: 'Customer relationship', score: 30, weight: 20, detail: 'No assessment recorded yet.' },
              { key: 'solution_fit', label: 'Solution fit', score: Math.max(40, Math.min(90, opp.matchScore)), weight: 25, detail: 'Initial estimate from match score.' },
              { key: 'incumbent_position', label: 'Incumbent position', score: 40, weight: 15, detail: 'Not yet assessed.' },
              { key: 'price_competitiveness', label: 'Price competitiveness', score: 40, weight: 15, detail: 'Not yet assessed.' },
              { key: 'past_performance', label: 'Past performance relevance', score: Math.max(35, Math.min(95, opp.matchScore - 5)), weight: 15, detail: 'Initial estimate from match score.' },
              { key: 'teaming_strength', label: 'Teaming strength', score: 30, weight: 10, detail: 'No teaming discussions recorded.' },
            ],
          },
        },
        include: { pwinFactors: true },
      })
      await db.opportunity.update({ where: { id: opp.id }, data: { status: 'tracked' } })
      await audit(user.orgId, user.name, user.role, 'opportunity.tracked', 'opportunity', opp.id, opp.title,
        `Pursuit created at Identified stage (${factors.length} match factors carried over).`)
      return json({ pursuit })
    }

    if (body.action === 'dismiss') {
      const opp = await db.opportunity.findFirst({ where: { id: body.id, orgId: user.orgId } })
      if (!opp) return err(404, 'Not found')
      const reason = typeof body.reason === 'string' && body.reason ? body.reason : 'Not a fit'
      await db.opportunity.update({ where: { id: opp.id }, data: { status: 'dismissed', dismissedReason: reason } })
      await audit(user.orgId, user.name, user.role, 'opportunity.dismissed', 'opportunity', opp.id, opp.title, `Reason: ${reason}`)
      return json({ ok: true })
    }

    if (body.action === 'restore') {
      const opp = await db.opportunity.findFirst({ where: { id: body.id, orgId: user.orgId } })
      if (!opp) return err(404, 'Not found')
      await db.opportunity.update({ where: { id: opp.id }, data: { status: 'new', dismissedReason: '' } })
      return json({ ok: true })
    }

    if (body.action === 'addManual') {
      const t = (body.title ?? '').trim()
      if (!t) return err(400, 'Title is required')
      const o = await db.opportunity.create({
        data: {
          orgId: user.orgId, source: 'manual',
          noticeType: body.noticeType ?? 'solicitation',
          title: t, solicitationNumber: body.solicitationNumber ?? 'MANUAL-' + Date.now().toString().slice(-6),
          agency: body.agency ?? 'State / Local (manual entry)',
          subTier: '', office: '',
          postedDate: new Date(), responseDeadline: body.deadline ? new Date(body.deadline) : null,
          naics: body.naics ?? '541512',
          psc: body.psc ?? '', setAside: body.setAside ?? 'None',
          popCity: body.popCity ?? '', popState: body.popState ?? '',
          description: body.description ?? '',
          estimatedValueCents: body.value ? Math.round(Number(body.value) * 100) : null,
          valueLabel: '', link: '',
          matchScore: 0, matchFactorsJson: '[]',
          status: 'new', dismissedReason: '',
        },
      })
      await audit(user.orgId, user.name, user.role, 'opportunity.created', 'opportunity', o.id, o.title, 'Manual entry (state/local or off-source notice).')
      return json({ opportunity: o })
    }

    return err(400, 'Unknown action')
  })
}
