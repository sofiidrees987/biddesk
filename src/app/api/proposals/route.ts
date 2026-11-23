import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

/** GET /api/proposals — list, or ?id= for full detail with requirements, sections, reviews */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const p = await db.proposal.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          requirements: { orderBy: { ref: 'asc' } },
          sections: { orderBy: { order: 'asc' } },
          reviewCycles: { include: { findings: true }, orderBy: { scheduledAt: 'asc' } },
          pursuit: true,
        },
      })
      if (!p) return err(404, 'Proposal not found')
      return json({
        proposal: {
          id: p.id, title: p.title, solicitationNumber: p.solicitationNumber, agency: p.agency,
          status: p.status, dueAt: p.dueAt, contractType: p.contractType, notes: p.notes,
          pursuit: p.pursuit ? { id: p.pursuit.id, title: p.pursuit.title, pwin: p.pursuit.pwin, stage: p.pursuit.stage } : null,
          requirements: p.requirements.map((r) => ({
            id: r.id, ref: r.ref, text: r.text, obligation: r.obligation, kind: r.kind,
            sourceDoc: r.sourceDoc, page: r.page, paragraph: r.paragraph, sourceExcerpt: r.sourceExcerpt,
            confidence: r.confidence, status: r.status, sectionKey: r.sectionKey, owner: r.owner,
          })),
          sections: p.sections.map((s) => ({
            id: s.id, volume: s.volume, key: s.key, title: s.title, instructions: s.instructions,
            pageLimit: s.pageLimit, content: s.content, assignee: s.assignee, dueDate: s.dueDate,
            status: s.status, order: s.order, winTheme: s.winTheme,
            wordCount: s.content ? s.content.trim().split(/\s+/).length : 0,
          })),
          reviewCycles: p.reviewCycles.map((rc) => ({
            id: rc.id, kind: rc.kind, status: rc.status, scheduledAt: rc.scheduledAt,
            summary: parseJsonSafe(rc.summaryJson, {}),
            findings: rc.findings.map((f) => ({
              id: f.id, sectionKey: f.sectionKey, severity: f.severity, comment: f.comment,
              disposition: f.disposition, response: f.response,
            })),
          })),
        },
      })
    }

    const proposals = await db.proposal.findMany({
      where: { orgId: user.orgId },
      include: { requirements: true, sections: true, pursuit: true },
      orderBy: { dueAt: 'asc' },
    })
    const now = new Date()
    return json({
      proposals: proposals.map((p) => {
        const total = p.requirements.filter((r) => r.status !== 'rejected').length
        const confirmed = p.requirements.filter((r) => r.status === 'confirmed' || r.status === 'edited').length
        return {
          id: p.id, title: p.title, solicitationNumber: p.solicitationNumber, agency: p.agency,
          status: p.status, dueAt: p.dueAt, contractType: p.contractType,
          daysRemaining: Math.ceil((p.dueAt.getTime() - now.getTime()) / 86400_000),
          coveragePct: total ? Math.round((confirmed / total) * 100) : 0,
          requirementCount: total,
          sectionsTotal: p.sections.length,
          sectionsFinal: p.sections.filter((s) => s.status === 'final').length,
          pursuitTitle: p.pursuit?.title ?? '',
        }
      }),
    })
  })
}

/** PATCH /api/proposals — mutate proposal state (requirements, sections, findings, intake simulation) */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const p = await db.proposal.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!p) return err(404, 'Proposal not found')

    // Requirement verification
    if (body.requirement && typeof body.requirement.id === 'string') {
      const r = await db.requirement.findFirst({ where: { id: body.requirement.id, proposalId: p.id } })
      if (!r) return err(404, 'Requirement not found')
      const status = ['extracted', 'confirmed', 'edited', 'rejected'].includes(body.requirement.status) ? body.requirement.status : r.status
      await db.requirement.update({
        where: { id: r.id },
        data: {
          status,
          ...(typeof body.requirement.text === 'string' && body.requirement.text ? { text: body.requirement.text, status: status === 'confirmed' ? 'edited' : status } : {}),
          ...(typeof body.requirement.sectionKey === 'string' ? { sectionKey: body.requirement.sectionKey } : {}),
        },
      })
      if (status !== r.status) {
        await audit(user.orgId, user.name, user.role, `requirement.${status}`, 'requirement', r.id, `${r.ref} — ${p.title}`,
          status === 'confirmed' ? 'Requirement verified against source passage.' : `Status set to ${status}.`)
      }
      return json({ ok: true })
    }

    // Section content / status
    if (body.section && typeof body.section.id === 'string') {
      const s = await db.proposalSection.findFirst({ where: { id: body.section.id, proposalId: p.id } })
      if (!s) return err(404, 'Section not found')
      const data: Record<string, unknown> = {}
      if (typeof body.section.content === 'string') data.content = body.section.content
      if (typeof body.section.status === 'string' && ['not_started', 'drafting', 'in_review', 'final'].includes(body.section.status)) data.status = body.section.status
      if (typeof body.section.content === 'string' && !body.section.status) {
        data.status = s.status === 'not_started' ? 'drafting' : s.status
      }
      await db.proposalSection.update({ where: { id: s.id }, data })
      return json({ ok: true })
    }

    // Finding disposition
    if (body.finding && typeof body.finding.id === 'string') {
      const f = await db.reviewFinding.findFirst({ where: { id: body.finding.id, proposalId: p.id } })
      if (!f) return err(404, 'Finding not found')
      const disposition = ['open', 'accepted', 'rejected', 'deferred'].includes(body.finding.disposition) ? body.finding.disposition : f.disposition
      await db.reviewFinding.update({
        where: { id: f.id },
        data: { disposition, response: typeof body.finding.response === 'string' ? body.finding.response : f.response },
      })
      await audit(user.orgId, user.name, user.role, 'review.finding_dispositioned', 'finding', f.id, `${p.title} review finding`,
        `${disposition}${body.finding.response ? `: ${body.finding.response}` : ''}`)
      return json({ ok: true })
    }

    // Review cycle: start / complete with generated findings summary
    if (body.review && typeof body.review.id === 'string') {
      const rc = await db.reviewCycle.findFirst({ where: { id: body.review.id, proposalId: p.id }, include: { findings: true } })
      if (!rc) return err(404, 'Review not found')
      if (body.review.action === 'start') {
        await db.reviewCycle.update({ where: { id: rc.id }, data: { status: 'in_progress' } })
        return json({ ok: true })
      }
      if (body.review.action === 'complete') {
        const findings = rc.findings
        const openCount = findings.filter((f) => f.disposition === 'open').length
        const blockers = findings.filter((f) => f.severity === 'blocker').length
        await db.reviewCycle.update({
          where: { id: rc.id },
          data: {
            status: 'complete',
            summaryJson: JSON.stringify({
              findingsTotal: findings.length, findingsOpen: openCount, blockers,
              notes: `${rc.kind.charAt(0).toUpperCase() + rc.kind.slice(1)} Team review complete: ${findings.length} findings recorded, ${openCount} open.`,
            }),
          },
        })
        await audit(user.orgId, user.name, user.role, 'review.completed', 'review', rc.id, `${p.title} ${rc.kind} team`,
          `${findings.length} findings (${openCount} open).`)
        return json({ ok: true })
      }
      return err(400, 'Unknown review action')
    }

    // Proposal status change
    if (typeof body.status === 'string') {
      await db.proposal.update({ where: { id: p.id }, data: { status: body.status } })
      await audit(user.orgId, user.name, user.role, 'proposal.status_changed', 'proposal', p.id, p.title, `Status → ${body.status}`)
      return json({ ok: true })
    }

    return err(400, 'Unknown update')
  })
}
