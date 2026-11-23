/**
 * Decimal-safe money arithmetic for pricing.
 *
 * All money values are integer cents. Rates are integer basis points
 * (1% = 100 bps). No floating point is used in rate build-ups; rounding
 * happens exactly once, at the final cent, with round-half-up semantics
 * implemented via integer math.
 */

export function mulBps(cents: number, bps: number): number {
  // cents * (bps / 10_000), rounded half-up at the cent level.
  return (cents * bps + 5_000) / 10_000 | 0
}

export function applyBps(cents: number, bps: number): number {
  // value * (1 + bps/10_000)
  return cents + mulBps(cents, bps)
}

export type IndirectRates = {
  fringeBps: number       // on labor
  overheadBps: number    // on labor + fringe
  gaBps: number          // on total cost input
  feeBps: number         // on cost
  materialHandlingBps?: number
}

/**
 * Loaded rate build-up with the standard order:
 *   base → +fringe (on base) → +overhead (on base+fringe) → cost
 *   → +G&A (on cost) → total cost → +fee (on total cost) → price
 * All operations in integer cents with single final rounding per step.
 */
export function loadedRate(baseRateCents: number, r: IndirectRates) {
  const fringe = mulBps(baseRateCents, r.fringeBps)
  const fringeLoaded = baseRateCents + fringe
  const overhead = mulBps(fringeLoaded, r.overheadBps)
  const cost = fringeLoaded + overhead
  const ga = mulBps(cost, r.gaBps)
  const totalCost = cost + ga
  const fee = mulBps(totalCost, r.feeBps)
  const price = totalCost + fee
  return { base: baseRateCents, fringe, fringeLoaded, overhead, cost, ga, totalCost, fee, price }
}

/** Escalate a rate for a period index: base * (1 + esc)^n, integer cents. */
export function escalate(cents: number, escalationBps: number, periods: number): number {
  let v = cents
  for (let i = 0; i < periods; i++) v = applyBps(v, escalationBps)
  return v
}

/** Multiply hours by a rate with a single rounding at the end. */
export function hoursCost(hours: number, rateCents: number): number {
  return Math.round(hours * rateCents)
}

export function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function fmtCentsCompact(cents: number): string {
  const d = cents / 100
  if (Math.abs(d) >= 1_000_000) return '$' + (d / 1_000_000).toFixed(d % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (Math.abs(d) >= 1_000) return '$' + (d / 1_000).toFixed(d % 1_000 === 0 ? 0 : 1) + 'K'
  return fmtCents(cents)
}
