/**
 * Pricing engine: computes loaded rates, period costs, CLIN build-ups and
 * sensitivity scenarios from a pricing model. All math is decimal-safe
 * (integer cents / basis points) per src/lib/money.ts.
 */
import { db } from '@/lib/db'
import { parseJsonSafe } from '@/lib/api'
import { loadedRate, escalate, hoursCost, applyBps } from '@/lib/money'

export type PeriodDef = { label: string; startDate: string; endDate: string; months: number }

export type LoadedRateRow = {
  lcatId: string
  lcatTitle: string
  baseRateCents: number
  fringe: number
  overhead: number
  cost: number
  ga: number
  totalCost: number
  fee: number
  price: number
  benchmarkLowCents: number
  benchmarkHighCents: number
}

export type PeriodTotals = {
  periodIndex: number
  label: string
  laborCostCents: number
  odcCents: number
  totalCostCents: number
  priceCents: number
  clinRef: string
}

export type LcatHours = { lcatId: string; lcatTitle: string; hours: number[] }

export type EngineResult = {
  rateSet: {
    id: string; name: string; fringeBps: number; overheadBps: number; gaBps: number; feeBps: number
    materialHandlingBps: number; overheadGovBps: number; source: string; effectiveDate: string
  }
  periods: PeriodDef[]
  escalationBps: number
  loadedRates: LoadedRateRow[]
  hours: LcatHours[]
  odcLines: { title: string; periodIndex: number; unitCostCents: number }[]
  periodTotals: PeriodTotals[]
  grandTotal: { costCents: number; priceCents: number }
  clins: { ref: string; name: string; type: string; periodLabel: string; valueCents: number }[]
}

export async function computeModel(modelId: string): Promise<EngineResult | null> {
  const model = await db.pricingModel.findUnique({
    where: { id: modelId },
    include: { lines: true, clins: true },
  })
  if (!model) return null

  const rateSet = await db.rateSet.findFirst({
    where: { orgId: model.orgId, status: 'active' },
    include: { laborCategories: true },
  })
  if (!rateSet) return null

  const periods = parseJsonSafe<PeriodDef[]>(model.periodsJson, [])
  const lcats = rateSet.laborCategories

  // Loaded rates (unescalated, period 0 base)
  const loadedRates: LoadedRateRow[] = lcats.map((l) => {
    const r = loadedRate(l.baseRateCents, {
      fringeBps: rateSet.fringeBps,
      overheadBps: rateSet.overheadBps,
      gaBps: rateSet.gaBps,
      feeBps: rateSet.feeBps,
    })
    return {
      lcatId: l.id, lcatTitle: l.title, baseRateCents: l.baseRateCents,
      fringe: r.fringe, overhead: r.overhead, cost: r.cost, ga: r.ga,
      totalCost: r.totalCost, fee: r.fee, price: r.price,
      benchmarkLowCents: l.benchmarkLowCents, benchmarkHighCents: l.benchmarkHighCents,
    }
  })

  // Hours grid
  const hoursMap = new Map<string, number[]>()
  for (const line of model.lines.filter((l) => l.kind === 'labor')) {
    const arr = hoursMap.get(line.lcatId) ?? new Array(periods.length).fill(0)
    arr[line.periodIndex] = (arr[line.periodIndex] ?? 0) + line.hours
    hoursMap.set(line.lcatId, arr)
  }
  const hours: LcatHours[] = []
  for (const l of lcats) {
    const arr = hoursMap.get(l.id)
    if (arr && arr.some((h) => h > 0)) hours.push({ lcatId: l.id, lcatTitle: l.title, hours: arr })
  }

  const odcLines = model.lines
    .filter((l) => l.kind !== 'labor')
    .map((l) => ({ title: l.lcatTitle, periodIndex: l.periodIndex, unitCostCents: l.unitCostCents ?? 0 }))

  // Period totals with escalation: rate for period n = loaded cost * (1+esc)^n (on cost, then fee applied)
  const periodTotals: PeriodTotals[] = periods.map((p, idx) => {
    let laborCost = 0
    let laborPrice = 0
    for (const h of hours) {
      const lr = loadedRates.find((r) => r.lcatId === h.lcatId)
      if (!lr) continue
      const hrs = h.hours[idx] ?? 0
      const escalatedCost = escalate(lr.totalCost, model.escalationBps, idx)
      const escalatedPrice = applyBps(escalatedCost, rateSet.feeBps)
      laborCost += hoursCost(hrs, escalatedCost)
      laborPrice += hoursCost(hrs, escalatedPrice)
    }
    let odc = 0
    for (const o of odcLines.filter((o2) => o2.periodIndex === idx)) odc += o.unitCostCents
    const clinRef = model.lines.find((l) => l.kind === 'labor' && l.periodIndex === idx)?.clinRef ?? `000${idx + 1}`
    return {
      periodIndex: idx, label: p.label,
      laborCostCents: laborCost, odcCents: odc,
      totalCostCents: laborCost + odc, priceCents: laborPrice + odc, clinRef,
    }
  })

  const grandTotal = {
    costCents: periodTotals.reduce((s, p) => s + p.totalCostCents, 0),
    priceCents: periodTotals.reduce((s, p) => s + p.priceCents, 0),
  }

  const clins = periodTotals
    .map((p) => ({
      ref: p.clinRef,
      name: `Period ${p.periodIndex === 0 ? 'Base' : `${p.periodIndex}`} — Technical Services`,
      type: 'ffp', periodLabel: p.label, valueCents: p.priceCents,
    }))
    .filter((c, i, arr) => arr.findIndex((x) => x.ref === c.ref) === i)

  const odcClin = odcLines.length
    ? [{ ref: '0005', name: 'Other Direct Costs', type: 'odc', periodLabel: 'All periods', valueCents: odcLines.reduce((s, o) => s + o.unitCostCents, 0) }]
    : []

  return {
    rateSet: {
      id: rateSet.id, name: rateSet.name,
      fringeBps: rateSet.fringeBps, overheadBps: rateSet.overheadBps, gaBps: rateSet.gaBps,
      feeBps: rateSet.feeBps, materialHandlingBps: rateSet.materialHandlingBps,
      overheadGovBps: rateSet.overheadGovBps,
      source: rateSet.source, effectiveDate: rateSet.effectiveDate.toISOString(),
    },
    periods, escalationBps: model.escalationBps, loadedRates, hours, odcLines,
    periodTotals, grandTotal, clins: [...clins, ...odcClin],
  }
}

/** Recompute a single scenario with adjusted inputs (sensitivity analysis). */
export function sensitivity(base: EngineResult, delta: { feeBpsDelta?: number; escalationBpsDelta?: number; hoursPctDelta?: number }): EngineResult {
  const feeBps = base.rateSet.feeBps + (delta.feeBpsDelta ?? 0)
  const escBps = base.escalationBps + (delta.escalationBpsDelta ?? 0)
  const hoursMult = 1 + (delta.hoursPctDelta ?? 0) / 100

  const loadedRates: LoadedRateRow[] = base.loadedRates.map((l) => {
    const r = loadedRate(l.baseRateCents, {
      fringeBps: base.rateSet.fringeBps,
      overheadBps: base.rateSet.overheadBps,
      gaBps: base.rateSet.gaBps,
      feeBps,
    })
    return { ...l, fee: r.fee, price: r.price }
  })

  const periodTotals: PeriodTotals[] = base.periodTotals.map((p, idx) => {
    let laborCost = 0
    let laborPrice = 0
    for (const h of base.hours) {
      const lr = loadedRates.find((r) => r.lcatId === h.lcatId)
      if (!lr) continue
      const hrs = Math.round((h.hours[idx] ?? 0) * hoursMult)
      const escalatedCost = escalate(lr.totalCost, escBps, idx)
      const escalatedPrice = applyBps(escalatedCost, feeBps)
      laborCost += hoursCost(hrs, escalatedCost)
      laborPrice += hoursCost(hrs, escalatedPrice)
    }
    const odc = base.odcLines.filter((o) => o.periodIndex === idx).reduce((s, o) => s + o.unitCostCents, 0)
    return {
      ...p, laborCostCents: laborCost, odcCents: odc,
      totalCostCents: laborCost + odc, priceCents: laborPrice + odc,
    }
  })

  return {
    ...base,
    rateSet: { ...base.rateSet, feeBps },
    escalationBps: escBps,
    loadedRates,
    periodTotals,
    grandTotal: {
      costCents: periodTotals.reduce((s, p) => s + p.totalCostCents, 0),
      priceCents: periodTotals.reduce((s, p) => s + p.priceCents, 0),
    },
  }
}
