import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

/** GET /api/library — company profile, past performances, resumes, content items */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase()
    const org = await db.organization.findUnique({ where: { id: user.orgId } })
    const [pp, resumes, items] = await Promise.all([
      db.pastPerformance.findMany({ where: { orgId: user.orgId }, orderBy: { endDate: 'desc' } }),
      db.resume.findMany({ where: { orgId: user.orgId }, orderBy: { name: 'asc' } }),
      db.libraryItem.findMany({ where: { orgId: user.orgId }, orderBy: { useCount: 'desc' } }),
    ])
    const match = (t: string) => !q || t.toLowerCase().includes(q)
    return json({
      companyProfile: org ? {
        name: org.name, legalName: org.legalName, uei: org.uei, cage: org.cage, samExpiry: org.samExpiry,
        primaryNaics: org.primaryNaics, naicsList: parseJsonSafe(org.naicsListJson, []),
        sizeStandard: org.sizeStandard, certifications: parseJsonSafe(org.certificationsJson, []),
        vehicles: parseJsonSafe(org.vehiclesJson, []),
        facilityClearance: org.facilityClearance, dcaaStatus: org.dcaaStatus,
        sprsScore: org.sprsScore, sprsDate: org.sprsDate,
      } : null,
      pastPerformances: pp.filter((x) => match(x.title + x.customer + x.narrative)).map((x) => ({
        id: x.id, customer: x.customer, contractNumber: x.contractNumber, title: x.title, valueCents: x.valueCents,
        startDate: x.startDate, endDate: x.endDate, role: x.role, naics: x.naics, psc: x.psc,
        tags: parseJsonSafe(x.tagsJson, []), narrative: x.narrative, outcomes: x.outcomes,
        cparsRating: x.cparsRating, referenceName: x.referenceName, referenceContact: x.referenceContact,
        referencePermission: x.referencePermission, status: x.status,
      })),
      resumes: resumes.filter((x) => match(x.name + x.title + x.summary)).map((x) => ({
        id: x.id, name: x.name, title: x.title, lcat: x.lcat, clearance: x.clearance,
        certifications: parseJsonSafe(x.certificationsJson, []), years: x.years,
        availability: x.availability, summary: x.summary, status: x.status,
      })),
      items: items.filter((x) => match(x.title + x.content)).map((x) => ({
        id: x.id, category: x.category, title: x.title, content: x.content,
        tags: parseJsonSafe(x.tagsJson, []), status: x.status, owner: x.owner,
        reviewBy: x.reviewBy, useCount: x.useCount,
      })),
    })
  })
}

/** PATCH /api/library — approve/archive items (approval workflow) */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const item = await db.libraryItem.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!item) return err(404, 'Item not found')
    const status = ['draft', 'approved', 'archived'].includes(body.status) ? body.status : item.status
    await db.libraryItem.update({ where: { id: item.id }, data: { status } })
    await audit(user.orgId, user.name, user.role, 'library.item_status', 'library_item', item.id, item.title, `Status → ${status}.`)
    return json({ ok: true })
  })
}
