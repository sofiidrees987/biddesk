import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

/** GET /api/contracts — list, or ?id= full detail */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const c = await db.contract.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          clins: true, deliverables: true, modifications: true, options: true,
          cpars: { orderBy: { periodLabel: 'desc' } }, invoices: true, subcontractors: true,
          pursuit: true,
        },
      })
      if (!c) return err(404, 'Contract not found')
      return json({
        contract: {
          id: c.id, number: c.number, vehicle: c.vehicle, type: c.type, agency: c.agency,
          coName: c.coName, corName: c.corName, status: c.status,
          awardDate: c.awardDate, startDate: c.startDate, endDate: c.endDate, popLabel: c.popLabel,
          ceilingCents: c.ceilingCents, obligatedCents: c.obligatedCents, fundedCents: c.fundedCents,
          closeout: parseJsonSafe(c.closeoutJson, []), pastPerformanceAdded: c.pastPerformanceAdded,
          pursuit: c.pursuit ? { id: c.pursuit.id, title: c.pursuit.title } : null,
          clins: c.clins.map((cl) => ({ id: cl.id, ref: cl.ref, name: cl.name, type: cl.type, periodLabel: cl.periodLabel, valueCents: cl.valueCents, fundedCents: cl.fundedCents })),
          deliverables: c.deliverables.map((d) => ({ id: d.id, title: d.title, didRef: d.didRef, frequency: d.frequency, nextDue: d.nextDue, status: d.status, lastSubmitted: d.lastSubmitted, recipients: d.recipients })),
          modifications: c.modifications.map((m) => ({ id: m.id, number: m.number, type: m.type, effectiveDate: m.effectiveDate, valueDeltaCents: m.valueDeltaCents, description: m.description })),
          options: c.options.map((o) => ({ id: o.id, label: o.label, exerciseBy: o.exerciseBy, preliminaryNoticeBy: o.preliminaryNoticeBy, exercised: o.exercised, exercisedAt: o.exercisedAt, modNumber: o.modNumber })),
          cpars: c.cpars.map((cp) => ({ id: cp.id, periodLabel: cp.periodLabel, status: cp.status, overallRating: cp.overallRating, ratings: parseJsonSafe(cp.ratingsJson, []), narrative: cp.narrative, responseDue: cp.responseDue, contractorComment: cp.contractorComment })),
          invoices: c.invoices.map((i) => ({ id: i.id, reference: i.reference, period: i.period, amountCents: i.amountCents, status: i.status })),
          subcontractors: c.subcontractors.map((s) => ({ id: s.id, name: s.name, valueCents: s.valueCents, smallBusiness: s.smallBusiness })),
        },
      })
    }

    const contracts = await db.contract.findMany({
      where: { orgId: user.orgId },
      include: { deliverables: true, options: true },
      orderBy: { endDate: 'asc' },
    })
    return json({
      contracts: contracts.map((c) => ({
        id: c.id, number: c.number, agency: c.agency, type: c.type, vehicle: c.vehicle, status: c.status,
        startDate: c.startDate, endDate: c.endDate, popLabel: c.popLabel,
        ceilingCents: c.ceilingCents, obligatedCents: c.obligatedCents, fundedCents: c.fundedCents,
        deliverableIssues: c.deliverables.filter((d) => d.status === 'late' || d.status === 'due_soon').length,
        optionPending: c.options.some((o) => !o.exercised && o.exerciseBy <= new Date(Date.now() + 60 * 86400_000)),
      })),
    })
  })
}

/** POST /api/contracts — actions on a contract */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string' || typeof body.action !== 'string') return err(400, 'Invalid request')
    const c = await db.contract.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!c) return err(404, 'Contract not found')

    if (body.action === 'deliverableStatus') {
      const d = await db.deliverable.findFirst({ where: { id: body.deliverableId, contractId: c.id } })
      if (!d) return err(404, 'Deliverable not found')
      const status = ['not_due', 'due_soon', 'submitted', 'accepted', 'late'].includes(body.status) ? body.status : d.status
      await db.deliverable.update({
        where: { id: d.id },
        data: { status, lastSubmitted: ['submitted', 'accepted'].includes(status) ? new Date() : d.lastSubmitted },
      })
      await audit(user.orgId, user.name, user.role, 'contract.deliverable_status', 'deliverable', d.id, `${d.title} — ${c.number}`, `Status → ${status}.`)
      return json({ ok: true })
    }

    if (body.action === 'addModification') {
      const mods = await db.modification.findMany({ where: { contractId: c.id } })
      const seq = mods.length + 1
      const type = ['administrative', 'funding', 'option_exercise', 'scope', 'pop_extension', 'other'].includes(body.type) ? body.type : 'other'
      const isFunding = type === 'funding'
      const mod = await db.modification.create({
        data: {
          contractId: c.id,
          number: isFunding ? `P${String(seq).padStart(5, '0')}` : `A${String(seq).padStart(5, '0')}`,
          type,
          effectiveDate: new Date(),
          valueDeltaCents: typeof body.valueDelta === 'number' ? Math.round(body.valueDelta * 100) : 0,
          description: typeof body.description === 'string' && body.description ? body.description : 'Modification recorded in BidDesk.',
        },
      })
      if (isFunding && mod.valueDeltaCents !== 0) {
        await db.contract.update({
          where: { id: c.id },
          data: { obligatedCents: { increment: mod.valueDeltaCents }, fundedCents: { increment: mod.valueDeltaCents } },
        })
      }
      await audit(user.orgId, user.name, user.role, 'contract.modification_recorded', 'modification', mod.id, `${mod.number} — ${c.number}`,
        `${mod.type} modification${mod.valueDeltaCents ? ` ($${(mod.valueDeltaCents / 100).toLocaleString('en-US')} value delta)` : ''}.`)
      return json({ modification: mod })
    }

    if (body.action === 'exerciseOption') {
      const o = await db.optionPeriod.findFirst({ where: { id: body.optionId, contractId: c.id } })
      if (!o) return err(404, 'Option not found')
      if (o.exercised) return err(400, 'Option already exercised')
      const mods = await db.modification.findMany({ where: { contractId: c.id } })
      const seq = mods.length + 1
      const mod = await db.modification.create({
        data: {
          contractId: c.id, number: `P${String(seq).padStart(5, '0')}`, type: 'option_exercise',
          effectiveDate: new Date(), valueDeltaCents: 0,
          description: `${o.label} exercised by the Government. Period of performance extended.`,
        },
      })
      await db.optionPeriod.update({ where: { id: o.id }, data: { exercised: true, exercisedAt: new Date(), modNumber: mod.number } })
      const nextEnd = new Date(c.endDate.getTime() + 365 * 86400_000)
      await db.contract.update({ where: { id: c.id }, data: { endDate: nextEnd, popLabel: `Base + exercised options (through ${o.label})` } })
      await audit(user.orgId, user.name, user.role, 'contract.option_exercised', 'option', o.id, `${o.label} — ${c.number}`,
        `Exercised via ${mod.number}; end date extended to ${nextEnd.toDateString()}.`)
      return json({ ok: true, modNumber: mod.number })
    }

    if (body.action === 'cparsRespond') {
      const cp = await db.cparsEvaluation.findFirst({ where: { id: body.cparsId, contractId: c.id } })
      if (!cp) return err(404, 'CPARS evaluation not found')
      const comment = typeof body.comment === 'string' ? body.comment : ''
      const status = comment ? 'draft' : cp.status
      await db.cparsEvaluation.update({ where: { id: cp.id }, data: { contractorComment: comment, status } })
      await audit(user.orgId, user.name, user.role, 'cpars.comment_saved', 'cpars', cp.id, `${cp.periodLabel} — ${c.number}`,
        comment ? 'Contractor comment drafted for review.' : 'Comment cleared.')
      return json({ ok: true })
    }

    if (body.action === 'addToLibrary') {
      if (c.pastPerformanceAdded) return err(400, 'Past performance already added for this contract')
      const pp = await db.pastPerformance.create({
        data: {
          orgId: user.orgId, customer: c.agency, contractNumber: c.number,
          title: `Performance on ${c.number}`,
          valueCents: c.ceilingCents, startDate: c.startDate, endDate: c.endDate, role: 'prime',
          naics: '', psc: '', tagsJson: JSON.stringify(['recently closed']),
          narrative: `Performance record generated from contract ${c.number} at closeout. Replace this narrative with the final CPARS-aligned summary before using in a proposal.`,
          outcomes: '', cparsRating: '', referenceName: c.corName, referenceContact: '',
          referencePermission: 'pending', status: 'draft',
        },
      })
      await db.contract.update({ where: { id: c.id }, data: { pastPerformanceAdded: true } })
      await audit(user.orgId, user.name, user.role, 'library.past_performance_created', 'past_performance', pp.id, pp.title,
        `Draft past performance created from contract ${c.number}. Awaiting approval in Library.`)
      return json({ pastPerformanceId: pp.id })
    }

    if (body.action === 'closeoutItem') {
      const checklist = parseJsonSafe<{ label: string; done: boolean }[]>(c.closeoutJson, [])
      const idx = checklist.findIndex((x) => x.label === body.label)
      if (idx >= 0) {
        checklist[idx].done = Boolean(body.done)
        await db.contract.update({ where: { id: c.id }, data: { closeoutJson: JSON.stringify(checklist) } })
        if (checklist.every((x) => x.done)) {
          await db.contract.update({ where: { id: c.id }, data: { status: 'closed' } })
        }
        await audit(user.orgId, user.name, user.role, 'contract.closeout_updated', 'contract', c.id, c.number,
          `Closeout item "${body.label}" marked ${body.done ? 'done' : 'open'}.`)
      }
      return json({ ok: true })
    }

    return err(400, 'Unknown action')
  })
}
