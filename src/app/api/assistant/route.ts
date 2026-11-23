import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

export type AssistantSource = { id: string; type: string; ref: string; title: string }

type Ctx = { section?: string; recordType?: string; recordId?: string }

/** Build a compact, factual context bundle from live records. */
async function buildContext(orgId: string, ctx: Ctx) {
  const [org, pursuits, proposals, contracts, opps] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.pursuit.findMany({ where: { orgId }, include: { pwinFactors: true, opportunity: true, teaming: { include: { partner: true } } } }),
    db.proposal.findMany({ where: { orgId }, include: { requirements: true, sections: true, reviewCycles: { include: { findings: true } } } }),
    db.contract.findMany({ where: { orgId }, include: { deliverables: true, options: true, modifications: true, cpars: true } }),
    db.opportunity.findMany({ where: { orgId, archived: false }, orderBy: { matchScore: 'desc' }, take: 12 }),
  ])
  return { org, pursuits, proposals, contracts, opps, ctx }
}

/** Deterministic, data-grounded answers for known question patterns. */
function deterministicAnswer(q: string, data: Awaited<ReturnType<typeof buildContext>>): { answer: string; sources: AssistantSource[] } | null {
  const lower = q.toLowerCase()
  const sources: AssistantSource[] = []
  const active = data.pursuits.filter((p) => !['won', 'lost'].includes(p.stage))
  const weighted = active.reduce((s, p) => s + Math.round(p.totalValueCents * p.pwin / 100), 0)
  const fmt = (c: number) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })

  if (lower.includes('pipeline') && (lower.includes('worth') || lower.includes('value') || lower.includes('summary'))) {
    for (const p of active.slice(0, 4)) {
      sources.push({ id: p.id, type: 'pursuit', ref: p.title, title: p.title })
    }
    return {
      answer: `Your active pipeline holds ${active.length} pursuits worth ${fmt(active.reduce((s, p) => s + p.totalValueCents, 0))} in total contract value, with a weighted value of ${fmt(weighted)} at current PWin scores. The largest is ${active.sort((a, b) => b.totalValueCents - a.totalValueCents)[0]?.title}. PWin factors and stage-by-stage detail are on the Pipeline board.`,
      sources,
    }
  }

  if (lower.includes('due') && (lower.includes('proposal') || lower.includes('deadline'))) {
    const upcoming = data.proposals
      .filter((p) => ['intake', 'requirements', 'writing', 'review'].includes(p.status))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    for (const p of upcoming) {
      sources.push({ id: p.id, type: 'proposal', ref: p.solicitationNumber, title: p.title })
    }
    if (!upcoming.length) return { answer: 'No proposals are currently in progress. All submitted proposals have closed.', sources: [] }
    const next = upcoming[0]
    const days = Math.ceil((next.dueAt.getTime() - Date.now()) / 86400_000)
    const reqs = next.requirements.length
    const confirmed = next.requirements.filter((r) => r.status === 'confirmed' || r.status === 'edited').length
    return {
      answer: `The next proposal due is "${next.title}" (${next.solicitationNumber}) in ${days} days. Its compliance matrix has ${confirmed} of ${reqs} requirements verified (${reqs ? Math.round(confirmed / reqs * 100) : 0} percent coverage), and ${next.sections.filter((s) => s.status !== 'not_started').length} of ${next.sections.length} outline sections are drafted or final.`,
      sources,
    }
  }

  if (lower.includes('compliance') || lower.includes('requirement')) {
    const p = data.proposals.find((x) => ['writing', 'review', 'requirements'].includes(x.status))
    if (!p) return null
    sources.push({ id: p.id, type: 'proposal', ref: p.solicitationNumber, title: p.title })
    const total = p.requirements.filter((r) => r.status !== 'rejected').length
    const confirmed = p.requirements.filter((r) => r.status === 'confirmed' || r.status === 'edited').length
    const unmapped = p.requirements.filter((r) => !r.sectionKey && r.status !== 'rejected').length
    return {
      answer: `For "${p.title}", ${confirmed} of ${total} requirements are verified in the compliance matrix. ${unmapped} requirements are not yet mapped to an outline section. Requirements with unconfirmed status still need a human review against the source passage before the matrix can be considered submission-ready.`,
      sources,
    }
  }

  if (lower.includes('option') || lower.includes('cpars') || lower.includes('contract')) {
    const c = data.contracts.find((x) => x.status !== 'closed' && (lower.includes('option') ? true : true))
    if (!c) return null
    sources.push({ id: c.id, type: 'contract', ref: c.number, title: c.number })
    const opt = c.options.find((o) => !o.exercised)
    const cp = c.cpars.find((x) => x.status === 'pending')
    const late = c.deliverables.find((d) => d.status === 'late')
    const parts: string[] = [`On contract ${c.number} (${c.agency})`]
    if (opt) {
      const days = Math.ceil((opt.exerciseBy.getTime() - Date.now()) / 86400_000)
      parts.push(`${opt.label} must be exercised within ${days} days${opt.preliminaryNoticeBy ? `, with preliminary notice due ${Math.ceil((opt.preliminaryNoticeBy.getTime() - Date.now()) / 86400_000)} days from now` : ''}`)
    }
    if (cp) parts.push(`the ${cp.periodLabel} CPARS evaluation is pending${cp.responseDue ? ` with the response window closing ${Math.ceil((cp.responseDue.getTime() - Date.now()) / 86400_000)} days from now` : ''}`)
    if (late) parts.push(`the "${late.title}" deliverable is currently late`)
    return { answer: parts.join(', ') + '.', sources }
  }

  if (lower.includes('opportunit') && (lower.includes('match') || lower.includes('best') || lower.includes('top'))) {
    const top = data.opps.filter((o) => o.status === 'new').slice(0, 3)
    for (const o of top) {
      sources.push({ id: o.id, type: 'opportunity', ref: o.solicitationNumber, title: o.title })
    }
    return {
      answer: `The strongest current matches are: ${top.map((o) => `"${o.title}" (${o.agency}) at a match score of ${o.matchScore}`).join('; ')}. Each score is explained by NAICS fit, set-aside eligibility, past performance relevance, vehicle fit, geography, and keyword factors on the opportunity detail view.`,
      sources,
    }
  }

  return null
}

/** POST /api/assistant — answer a question grounded in organization data */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    const question = typeof body?.question === 'string' ? body.question.trim() : ''
    if (!question) return err(400, 'A question is required')
    const ctx: Ctx = { section: body.section, recordType: body.recordType, recordId: body.recordId }

    const data = await buildContext(user.orgId, ctx)

    // Deterministic answers first (always correct, always cited)
    const det = deterministicAnswer(question, data)
    if (det) {
      return json({ answer: det.answer, sources: det.sources, engine: 'records' })
    }

    // LLM answer with a compact context payload
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk')
      const zai = await ZAI.create()

      const contextSummary = {
        organization: data.org ? { name: data.org.name, primaryNaics: data.org.primaryNaics, targetAgency: data.org.targetAgency } : null,
        activePipeline: data.pursuits.filter((p) => !['won', 'lost'].includes(p.stage)).map((p) => ({
          title: p.title, stage: p.stage, pwin: p.pwin, totalValue: p.totalValueCents / 100,
          factors: p.pwinFactors.map((f) => ({ label: f.label, score: f.score, weight: f.weight })),
          teaming: p.teaming.map((t) => ({ partner: t.partner.name, role: t.role, worksharePct: t.worksharePct })),
        })),
        proposals: data.proposals.map((p) => ({
          title: p.title, status: p.status, dueAt: p.dueAt.toISOString().slice(0, 10),
          requirementsTotal: p.requirements.length,
          requirementsConfirmed: p.requirements.filter((r) => ['confirmed', 'edited'].includes(r.status)).length,
          sections: p.sections.map((s) => ({ title: s.title, status: s.status, assignee: s.assignee })),
          openFindings: p.reviewCycles.flatMap((rc) => rc.findings.filter((f) => f.disposition === 'open').map((f) => ({ severity: f.severity, comment: f.comment }))),
        })),
        contracts: data.contracts.map((c) => ({
          number: c.number, agency: c.agency, status: c.status, ceiling: c.ceilingCents / 100,
          obligated: c.obligatedCents / 100,
          pendingOptions: c.options.filter((o) => !o.exercised).map((o) => ({ label: o.label, exerciseBy: o.exerciseBy.toISOString().slice(0, 10) })),
          pendingCpars: c.cpars.filter((x) => x.status === 'pending').map((x) => x.periodLabel),
          lateDeliverables: c.deliverables.filter((d) => d.status === 'late').map((d) => d.title),
        })),
        topOpportunities: data.opps.slice(0, 6).map((o) => ({ title: o.title, agency: o.agency, matchScore: o.matchScore, deadline: o.responseDeadline?.toISOString().slice(0, 10) })),
      }

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content: `You are the Assistant inside BidDesk, a platform for government contractors sold by ${data.org?.name ?? 'the user’s company'}. Answer the user's question using ONLY the JSON record data provided. Rules: (1) Be concise, factual, and professional. (2) Cite records inline by name or number, e.g. (36C25X25Q0187) or (W912DZ24D0015). (3) If the data does not contain the answer, say exactly what information is missing and where the user could record it. (4) Never invent numbers, dates, names, or statuses. (5) Plain business language, no markdown headings.`,
          },
          { role: 'user', content: `Record data:\n${JSON.stringify(contextSummary)}\n\nQuestion: ${question}` },
        ],
        thinking: { type: 'disabled' },
      })
      const answer = completion.choices[0]?.message?.content?.trim()
      if (answer) {
        const sources: AssistantSource[] = []
        for (const p of data.proposals) if (answer.includes(p.solicitationNumber) || answer.includes(p.title)) sources.push({ id: p.id, type: 'proposal', ref: p.solicitationNumber, title: p.title })
        for (const c of data.contracts) if (answer.includes(c.number)) sources.push({ id: c.id, type: 'contract', ref: c.number, title: c.number })
        for (const p of data.pursuits) if (answer.includes(p.title)) sources.push({ id: p.id, type: 'pursuit', ref: p.title, title: p.title })
        for (const o of data.opps) if (answer.includes(o.title)) sources.push({ id: o.id, type: 'opportunity', ref: o.solicitationNumber, title: o.title })
        await audit(user.orgId, user.name, user.role, 'assistant.answered', 'assistant', '', 'Assistant question',
          `"${question.slice(0, 120)}"`)
        return json({ answer, sources, engine: 'assistant' })
      }
    } catch {
      // fall through to fallback
    }

    return json({
      answer: 'I can answer questions about your pipeline, proposals, compliance coverage, contracts, options, CPARS, deliverables, and opportunity matches. Try one of the suggested questions, or ask about a specific record by its solicitation or contract number.',
      sources: [],
      engine: 'fallback',
    })
  })
}
