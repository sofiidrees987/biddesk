import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, parseJsonSafe } from '@/lib/api'

/** GET /api/search?q= — global search across records (powers the command palette) */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase().trim()
    if (q.length < 1) return json({ results: [] })
    const orgId = user.orgId

    const [opps, pursuits, proposals, contracts, pps, items, resumes] = await Promise.all([
      db.opportunity.findMany({ where: { orgId, archived: false } }),
      db.pursuit.findMany({ where: { orgId } }),
      db.proposal.findMany({ where: { orgId } }),
      db.contract.findMany({ where: { orgId } }),
      db.pastPerformance.findMany({ where: { orgId } }),
      db.libraryItem.findMany({ where: { orgId } }),
      db.resume.findMany({ where: { orgId } }),
    ])

    const results: { type: string; id: string; title: string; subtitle: string; section: string }[] = []
    for (const o of opps) {
      if (`${o.title} ${o.solicitationNumber} ${o.agency}`.toLowerCase().includes(q)) {
        results.push({ type: 'opportunity', id: o.id, title: o.title, subtitle: `${o.agency} — ${o.solicitationNumber}`, section: 'opportunities' })
      }
    }
    for (const p of pursuits) {
      if (`${p.title} ${p.agency}`.toLowerCase().includes(q)) {
        results.push({ type: 'pursuit', id: p.id, title: p.title, subtitle: `Pipeline — ${p.stage.replace('_', ' ')}`, section: 'pipeline' })
      }
    }
    for (const p of proposals) {
      if (`${p.title} ${p.solicitationNumber}`.toLowerCase().includes(q)) {
        results.push({ type: 'proposal', id: p.id, title: p.title, subtitle: `Proposal — ${p.status}`, section: 'proposals' })
      }
    }
    for (const c of contracts) {
      if (`${c.number} ${c.agency}`.toLowerCase().includes(q)) {
        results.push({ type: 'contract', id: c.id, title: c.number, subtitle: `Contract — ${c.agency}`, section: 'contracts' })
      }
    }
    for (const pp of pps) {
      if (`${pp.title} ${pp.customer}`.toLowerCase().includes(q)) {
        results.push({ type: 'past_performance', id: pp.id, title: pp.title, subtitle: `Library — ${pp.customer}`, section: 'library' })
      }
    }
    for (const it of items) {
      if (`${it.title}`.toLowerCase().includes(q)) {
        results.push({ type: 'library_item', id: it.id, title: it.title, subtitle: `Library — ${parseJsonSafe<string[]>(it.tagsJson, []).join(', ')}`, section: 'library' })
      }
    }
    for (const r of resumes) {
      if (`${r.name} ${r.title}`.toLowerCase().includes(q)) {
        results.push({ type: 'resume', id: r.id, title: r.name, subtitle: `Library — ${r.title}`, section: 'library' })
      }
    }

    return json({ results: results.slice(0, 20) })
  })
}
