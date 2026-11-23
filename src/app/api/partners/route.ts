import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err } from '@/lib/api'
import { audit } from '@/lib/auth'

/** GET /api/partners — directory with teaming agreements */
export async function GET() {
  return withAuth(async (user) => {
    const partners = await db.partner.findMany({
      where: { orgId: user.orgId },
      include: { teaming: { include: { pursuit: true } } },
      orderBy: { name: 'asc' },
    })
    return json({
      partners: partners.map((p) => ({
        id: p.id, name: p.name, uei: p.uei, capabilities: p.capabilities,
        certifications: p.certifications, location: p.location, naics: p.naics,
        ndaStatus: p.ndaStatus, taStatus: p.taStatus, performanceRating: p.performanceRating, notes: p.notes,
        teaming: p.teaming.map((t) => ({ id: t.id, pursuitTitle: t.pursuit.title, role: t.role, worksharePct: t.worksharePct })),
      })),
    })
  })
}

/** PATCH /api/partners — update NDA/TA status or notes */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const p = await db.partner.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!p) return err(404, 'Partner not found')
    const data: Record<string, unknown> = {}
    if (['none', 'executed', 'expired'].includes(body.ndaStatus)) data.ndaStatus = body.ndaStatus
    if (['none', 'negotiating', 'executed'].includes(body.taStatus)) data.taStatus = body.taStatus
    if (typeof body.notes === 'string') data.notes = body.notes
    if (Object.keys(data).length === 0) return err(400, 'Nothing to update')
    await db.partner.update({ where: { id: p.id }, data })
    await audit(user.orgId, user.name, user.role, 'partner.updated', 'partner', p.id, p.name,
      Object.entries(data).map(([k, v]) => `${k} → ${v}`).join('; '))
    return json({ ok: true })
  })
}
