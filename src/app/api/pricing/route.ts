import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'
import { computeModel, sensitivity, type PeriodDef } from '@/lib/pricing-engine'

/** GET /api/pricing — all pricing data (rate sets, LCATs, models) or ?id= engine detail */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const result = await computeModel(id)
      if (!result) return err(404, 'Pricing model not found')
      const model = await db.pricingModel.findUnique({ where: { id } })
      // Guard tenancy
      if (!model || model.orgId !== user.orgId) return err(404, 'Pricing model not found')
      const scenarios = {
        feeMinus: sensitivity(result, { feeBpsDelta: -200 }),
        feePlus: sensitivity(result, { feeBpsDelta: 200 }),
        escMinus: sensitivity(result, { escalationBpsDelta: -100 }),
        escPlus: sensitivity(result, { escalationBpsDelta: 100 }),
        hoursMinus: sensitivity(result, { hoursPctDelta: -10 }),
        hoursPlus: sensitivity(result, { hoursPctDelta: 10 }),
      }
      return json({ engine: result, scenarios, model: { id: model.id, name: model.name, contractType: model.contractType, status: model.status, proposalId: model.proposalId } })
    }

    const [rateSets, models] = await Promise.all([
      db.rateSet.findMany({ where: { orgId: user.orgId }, include: { laborCategories: true }, orderBy: { effectiveDate: 'desc' } }),
      db.pricingModel.findMany({ where: { orgId: user.orgId }, include: { proposal: true }, orderBy: { updatedAt: 'desc' } }),
    ])
    return json({
      rateSets: rateSets.map((rs) => ({
        id: rs.id, name: rs.name, effectiveDate: rs.effectiveDate, source: rs.source, status: rs.status,
        fringeBps: rs.fringeBps, overheadBps: rs.overheadBps, overheadGovBps: rs.overheadGovBps,
        materialHandlingBps: rs.materialHandlingBps, gaBps: rs.gaBps, feeBps: rs.feeBps,
        laborCategories: rs.laborCategories.map((l) => ({
          id: l.id, title: l.title, description: l.description, baseRateCents: l.baseRateCents,
          clearance: l.clearance, minYears: l.minYears,
          benchmarkLowCents: l.benchmarkLowCents, benchmarkHighCents: l.benchmarkHighCents,
        })),
      })),
      models: models.map((m) => ({
        id: m.id, name: m.name, contractType: m.contractType, status: m.status,
        escalationBps: m.escalationBps, periods: parseJsonSafe<PeriodDef[]>(m.periodsJson, []),
        proposalTitle: m.proposal?.title ?? '',
      })),
    })
  })
}

/** PATCH /api/pricing — update rates, escalation, hours, or CLIN labels; returns recomputed engine */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const model = await db.pricingModel.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!model) return err(404, 'Pricing model not found')
    let what = ''

    if (body.rates) {
      const rs = await db.rateSet.findFirst({ where: { orgId: user.orgId, status: 'active' } })
      if (!rs) return err(404, 'No active rate set')
      const clamp = (v: unknown, def: number) => typeof v === 'number' && v >= 0 && v <= 10000 ? Math.round(v) : def
      await db.rateSet.update({
        where: { id: rs.id },
        data: {
          fringeBps: clamp(body.rates.fringeBps, rs.fringeBps),
          overheadBps: clamp(body.rates.overheadBps, rs.overheadBps),
          gaBps: clamp(body.rates.gaBps, rs.gaBps),
          feeBps: clamp(body.rates.feeBps, rs.feeBps),
        },
      })
      what = 'Indirect rates updated'
    }

    if (typeof body.escalationBps === 'number' && body.escalationBps >= 0 && body.escalationBps <= 2000) {
      await db.pricingModel.update({ where: { id: model.id }, data: { escalationBps: Math.round(body.escalationBps) } })
      what = what ? what + '; escalation updated' : 'Escalation updated'
    }

    if (Array.isArray(body.hours)) {
      for (const h of body.hours) {
        if (typeof h.lcatId === 'string' && typeof h.periodIndex === 'number' && typeof h.hours === 'number') {
          const line = await db.pricingLine.findFirst({
            where: { modelId: model.id, lcatId: h.lcatId, periodIndex: h.periodIndex, kind: 'labor' },
          })
          if (line) {
            await db.pricingLine.update({ where: { id: line.id }, data: { hours: Math.max(0, Math.round(h.hours)) } })
          }
        }
      }
      what = what ? what + '; hours updated' : 'Hours updated'
    }

    if (what) {
      await audit(user.orgId, user.name, user.role, 'pricing.updated', 'pricing_model', model.id, model.name, what)
    }
    const result = await computeModel(model.id)
    if (!result) return err(500, 'Computation failed')
    return json({ engine: result })
  })
}

/** POST /api/pricing — actions: createContractClins */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || body.action !== 'createContractClins' || typeof body.id !== 'string' || typeof body.contractId !== 'string') {
      return err(400, 'Invalid request')
    }
    const model = await db.pricingModel.findFirst({ where: { id: body.id, orgId: user.orgId } })
    const contract = await db.contract.findFirst({ where: { id: body.contractId, orgId: user.orgId } })
    if (!model || !contract) return err(404, 'Not found')

    const engine = await computeModel(model.id)
    if (!engine) return err(500, 'Computation failed')

    await db.clin.deleteMany({ where: { contractId: contract.id, modelId: null } })
    for (const c of engine.clins) {
      await db.clin.create({
        data: {
          orgId: user.orgId, contractId: contract.id, ref: c.ref, name: c.name, type: c.type,
          periodLabel: c.periodLabel, valueCents: c.valueCents, unitPriceCents: c.valueCents,
          quantity: 1, fundedCents: c.periodLabel === 'Base Period' || c.periodLabel === 'All periods' ? c.valueCents : 0,
        },
      })
    }
    const total = engine.grandTotal.priceCents
    await db.contract.update({
      where: { id: contract.id },
      data: { ceilingCents: total, obligatedCents: engine.periodTotals[0]?.priceCents ?? 0, fundedCents: engine.periodTotals[0]?.priceCents ?? 0 },
    })
    await audit(user.orgId, user.name, user.role, 'pricing.clins_to_contract', 'pricing_model', model.id, model.name,
      `${engine.clins.length} CLINs (${(total / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} total) carried to contract ${contract.number}.`)
    return json({ ok: true, clinCount: engine.clins.length, totalCents: total })
  })
}
