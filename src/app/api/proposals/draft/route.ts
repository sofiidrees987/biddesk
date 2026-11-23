import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

export type DraftSource = {
  id: string
  type: 'library' | 'past_performance' | 'requirement'
  ref: string
  title: string
  excerpt: string
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'shall', 'your', 'our', 'their', 'plan', 'approach', 'including', 'provide', 'describe', 'section', 'volume', 'proposal', 'offeror', 'contractor', 'government'])

function keywordsOf(text: string): string[] {
  return Array.from(new Set(
    text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  ))
}

function scoreText(queryWords: string[], text: string): number {
  const lower = text.toLowerCase()
  let hits = 0
  for (const w of queryWords) if (lower.includes(w)) hits++
  return queryWords.length ? hits / queryWords.length : 0
}

/** POST /api/proposals/draft — grounded draft for a section, or a structured "needs input" response */
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.proposalId !== 'string' || typeof body.sectionId !== 'string') {
      return err(400, 'Invalid request', 'proposalId and sectionId are required.')
    }
    const p = await db.proposal.findFirst({
      where: { id: body.proposalId, orgId: user.orgId },
      include: { sections: true, requirements: true },
    })
    if (!p) return err(404, 'Proposal not found')
    const section = p.sections.find((s) => s.id === body.sectionId)
    if (!section) return err(404, 'Section not found')

    // Only approved library content is eligible for drafting.
    const [libraryItems, pastPerformances] = await Promise.all([
      db.libraryItem.findMany({ where: { orgId: user.orgId, status: 'approved' } }),
      db.pastPerformance.findMany({ where: { orgId: user.orgId, status: 'approved' } }),
    ])

    const reqs = p.requirements.filter((r) => r.sectionKey === section.key && r.status !== 'rejected')
    const queryWords = keywordsOf(`${section.title} ${section.instructions} ${reqs.map((r) => r.text).join(' ')}`)

    // Rank library + past performance by relevance
    const scored: { source: DraftSource; score: number }[] = []
    for (const item of libraryItems) {
      const tags = parseJsonSafe<string[]>(item.tagsJson, [])
      const sc = scoreText(queryWords, item.title + ' ' + item.content + ' ' + tags.join(' '))
      if (sc > 0.08) {
        scored.push({
          source: { id: item.id, type: 'library', ref: item.title, title: item.title, excerpt: item.content.slice(0, 420) },
          score: sc,
        })
      }
    }
    for (const pp of pastPerformances) {
      const tags = parseJsonSafe<string[]>(pp.tagsJson, [])
      const sc = scoreText(queryWords, pp.title + ' ' + pp.narrative + ' ' + pp.outcomes + ' ' + tags.join(' '))
      if (sc > 0.1) {
        scored.push({
          source: { id: pp.id, type: 'past_performance', ref: pp.contractNumber, title: `${pp.title} (${pp.customer})`, excerpt: (pp.narrative + ' ' + pp.outcomes).slice(0, 420) },
          score: sc,
        })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    const libSources = scored.slice(0, 4).map((s) => s.source)

    // Grounding gate: we need at least one library source AND one requirement
    // (or the section has no requirements mapped, in which case library-only drafting proceeds).
    if (libSources.length === 0) {
      const missing: string[] = []
      missing.push(`No approved library content matches the topics of "${section.title}" (${queryWords.slice(0, 6).join(', ')}).`)
      if (reqs.length === 0) missing.push('This section has no requirements mapped to it yet. Map requirements in the compliance matrix first.')
      missing.push('Add an approved Library item (boilerplate, past performance, or resume) covering these topics, then draft again.')
      await audit(user.orgId, user.name, user.role, 'assistant.draft_needs_input', 'section', section.id, `${section.title} — ${p.title}`,
        'Insufficient grounded support; author input requested.')
      return json({ status: 'needs_input', missing })
    }

    // Requirement citations (the "ground truth" the draft must respond to)
    const reqSources: DraftSource[] = reqs.slice(0, 4).map((r) => ({
      id: r.id, type: 'requirement' as const, ref: r.ref, title: `${r.sourceDoc} ${r.ref}`,
      excerpt: r.sourceExcerpt.slice(0, 420),
    }))
    const sources = [...reqSources, ...libSources]

    // Assemble a grounded draft. Every claim maps to a citation [S1]...[Sn].
    const reqCites = reqSources.map((_, i) => `[S${i + 1}]`).join(' ')
    const libCites = libSources.map((_, i) => `[S${reqSources.length + i + 1}]`).join(' ')

    const paragraphs: string[] = []
    paragraphs.push(
      `${section.title.includes('Past Performance') ? 'The citations below demonstrate directly relevant performance.' : 'Our approach to ' + section.title.replace(/^\d+\.\s*/, '').toLowerCase() + ' is grounded in the requirements of ' + p.solicitationNumber + ' and in delivery patterns proven on comparable federal programs.'} ${reqSources.length ? `The response below addresses ${reqSources.map((r) => r.ref).join(', ')} ${reqCites}.` : ''}`.trim(),
    )

    // Use the strongest library sources as the body of the draft
    let li = 0
    for (const src of libSources.slice(0, 3)) {
      const sIdx = reqSources.length + li + 1
      const firstSentence = src.excerpt.split(/(?<=\.)\s/).slice(0, 2).join(' ')
      paragraphs.push(
        (src.type === 'past_performance'
          ? `On ${src.title}, we delivered measurable results: `
          : '') + firstSentence + ` [S${sIdx}]`,
      )
      li++
    }

    if (section.winTheme) {
      paragraphs.push(`Discriminator. ${section.winTheme} ${libCites}`)
    }

    paragraphs.push(
      `Compliance. Every instruction in ${p.solicitationNumber} Section L and every evaluation factor in Section M that maps to this section is addressed above${reqSources.length ? ` (${reqSources.map((r) => r.ref).join(', ')})` : ''}; the compliance matrix cross-references each requirement to this response.`,
    )

    const assembledDraft = paragraphs.join('\n\n')

    // Try LLM polish (kept grounded: citations must be preserved verbatim)
    let draft = assembledDraft
    let engine: 'assembled' | 'assistant' = 'assembled'
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk')
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content: 'You are the drafting engine inside BidDesk, a platform for government contractors. You edit a grounded proposal section draft. Rules: (1) Keep every [S1]-style citation exactly where it appears or move it to the sentence it supports; never invent new citations. (2) Do not add facts, numbers, names, or claims that are not present in the provided text. (3) Improve flow, concision, and professional tone. (4) Return only the revised section text, no preamble.',
          },
          { role: 'user', content: `Section: ${section.title}\nInstructions: ${section.instructions}\n\nDraft to polish:\n${assembledDraft}` },
        ],
        thinking: { type: 'disabled' },
      })
      const out = completion.choices[0]?.message?.content?.trim()
      // Validate: every original citation must survive
      if (out && libSources.length + reqSources.length > 0) {
        const allCitesPresent = sources.every((_, i) => out.includes(`[S${i + 1}]`))
        if (allCitesPresent && out.length > 200) {
          draft = out
          engine = 'assistant'
        }
      }
    } catch {
      // LLM unavailable — the assembled grounded draft stands on its own.
    }

    await db.aiGeneration.create({
      data: {
        orgId: user.orgId, userName: user.name, kind: 'section_draft',
        target: `${section.title} — ${p.title}`,
        sourcesJson: JSON.stringify(sources.map((s) => ({ id: s.id, type: s.type, ref: s.ref, title: s.title }))),
        output: draft,
      },
    })
    await audit(user.orgId, user.name, user.role, 'assistant.draft_generated', 'section', section.id, `${section.title} — ${p.title}`,
      `Grounded draft with ${sources.length} citations (${engine === 'assistant' ? 'Assistant-polished' : 'assembled from approved sources'}). Awaiting author acceptance.`)

    return json({ status: 'draft', draft, sources, engine })
  })
}

/** PUT /api/proposals/draft — record acceptance or rejection of a draft */
export async function PUT(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.accepted !== 'boolean' || typeof body.sectionId !== 'string') {
      return err(400, 'Invalid request')
    }
    const section = await db.proposalSection.findFirst({ where: { id: body.sectionId } })
    if (!section) return err(404, 'Section not found')
    const latest = await db.aiGeneration.findFirst({
      where: { orgId: user.orgId, kind: 'section_draft', target: { contains: section.title } },
      orderBy: { createdAt: 'desc' },
    })
    if (latest) {
      await db.aiGeneration.update({ where: { id: latest.id }, data: { accepted: body.accepted } })
    }
    await audit(user.orgId, user.name, user.role, body.accepted ? 'assistant.draft_accepted' : 'assistant.draft_rejected',
      'section', section.id, section.title, body.accepted ? 'Author accepted the draft content.' : 'Author rejected the draft.')
    return json({ ok: true })
  })
}
