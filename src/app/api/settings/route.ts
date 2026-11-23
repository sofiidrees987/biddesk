import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err, parseJsonSafe } from '@/lib/api'
import { audit } from '@/lib/auth'

const ROLE_MATRIX = [
  { role: 'Owner', permissions: { opportunities: 'Manage', pipeline: 'Manage', proposals: 'Manage', pricing: 'Manage', contracts: 'Manage', library: 'Manage', partners: 'Manage', reports: 'View', settings: 'Manage', audit: 'View' } },
  { role: 'Admin', permissions: { opportunities: 'Manage', pipeline: 'Manage', proposals: 'Manage', pricing: 'Manage', contracts: 'Manage', library: 'Manage', partners: 'Manage', reports: 'View', settings: 'Manage', audit: 'View' } },
  { role: 'Capture Manager', permissions: { opportunities: 'Manage', pipeline: 'Manage', proposals: 'Contribute', pricing: 'View', contracts: 'View', library: 'Contribute', partners: 'Manage', reports: 'View', settings: 'None', audit: 'None' } },
  { role: 'Proposal Manager', permissions: { opportunities: 'View', pipeline: 'Contribute', proposals: 'Manage', pricing: 'View', contracts: 'None', library: 'Contribute', partners: 'View', reports: 'View', settings: 'None', audit: 'None' } },
  { role: 'Contracts Manager', permissions: { opportunities: 'None', pipeline: 'View', proposals: 'View', pricing: 'View', contracts: 'Manage', library: 'Contribute', partners: 'View', reports: 'View', settings: 'None', audit: 'None' } },
  { role: 'Pricing Analyst', permissions: { opportunities: 'None', pipeline: 'View', proposals: 'Contribute', pricing: 'Manage', contracts: 'View', library: 'View', partners: 'None', reports: 'View', settings: 'None', audit: 'None' } },
  { role: 'Contributor', permissions: { opportunities: 'View', pipeline: 'View', proposals: 'Contribute', pricing: 'None', contracts: 'None', library: 'View', partners: 'None', reports: 'None', settings: 'None', audit: 'None' } },
  { role: 'Reviewer', permissions: { opportunities: 'None', pipeline: 'None', proposals: 'Contribute', pricing: 'None', contracts: 'None', library: 'None', partners: 'None', reports: 'None', settings: 'None', audit: 'None' } },
  { role: 'Read-only', permissions: { opportunities: 'View', pipeline: 'View', proposals: 'View', pricing: 'View', contracts: 'View', library: 'View', partners: 'View', reports: 'View', settings: 'None', audit: 'None' } },
]

/** GET /api/settings — org settings data */
export async function GET() {
  return withAuth(async (user) => {
    const [org, users, integrations, aiGenerations] = await Promise.all([
      db.organization.findUnique({ where: { id: user.orgId } }),
      db.user.findMany({ where: { orgId: user.orgId }, orderBy: { name: 'asc' } }),
      db.integration.findMany({ where: { orgId: user.orgId }, orderBy: { name: 'asc' } }),
      db.aiGeneration.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ])
    return json({
      organization: org ? {
        name: org.name, legalName: org.legalName, uei: org.uei, cage: org.cage,
        primaryNaics: org.primaryNaics, targetAgency: org.targetAgency,
        pwinWeights: parseJsonSafe(org.pwinWeightsJson, []),
        gateCriteria: parseJsonSafe(org.gateCriteriaJson, []),
      } : null,
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, initials: u.initials, mfaEnabled: u.mfaEnabled, active: u.active })),
      roleMatrix: ROLE_MATRIX,
      integrations: integrations.map((i) => ({ id: i.id, key: i.key, name: i.name, status: i.status, reason: i.reason, detail: i.detail })),
      aiGenerations: aiGenerations.map((g) => ({
        id: g.id, kind: g.kind, target: g.target, accepted: g.accepted,
        createdAt: g.createdAt, userName: g.userName,
        sources: parseJsonSafe(g.sourcesJson, []),
      })),
    })
  })
}

/** PATCH /api/settings — org profile, PWin weights, gate criteria */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'Invalid request')
    const org = await db.organization.findUnique({ where: { id: user.orgId } })
    if (!org) return err(404, 'Organization not found')

    if (!['Owner', 'Admin'].includes(user.role)) {
      return err(403, 'Not authorized', 'Only Owners and Admins can change organization settings.')
    }

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.targetAgency === 'string') data.targetAgency = body.targetAgency
    if (typeof body.primaryNaics === 'string' && body.primaryNaics.trim()) data.primaryNaics = body.primaryNaics.trim()
    if (Array.isArray(body.pwinWeights)) {
      const total = body.pwinWeights.reduce((s: number, w: { weight: number }) => s + (Number(w.weight) || 0), 0)
      if (total !== 100) return err(400, 'PWin weights must total 100 percent')
      data.pwinWeightsJson = JSON.stringify(body.pwinWeights)
    }
    if (Array.isArray(body.gateCriteria)) {
      const total = body.gateCriteria.reduce((s: number, w: { weight: number }) => s + (Number(w.weight) || 0), 0)
      if (total !== 100) return err(400, 'Gate criteria weights must total 100 percent')
      data.gateCriteriaJson = JSON.stringify(body.gateCriteria)
    }
    if (typeof body.firstRunDone === 'boolean') data.firstRunDone = body.firstRunDone
    if (typeof body.walkthroughSeen === 'boolean') data.walkthroughSeen = body.walkthroughSeen

    if (Object.keys(data).length === 0) return err(400, 'Nothing to update')
    await db.organization.update({ where: { id: org.id }, data })
    if (typeof body.firstRunDone !== 'boolean' && typeof body.walkthroughSeen !== 'boolean') {
      await audit(user.orgId, user.name, user.role, 'settings.updated', 'organization', org.id, org.name,
        Object.keys(data).filter((k) => !k.endsWith('Json')).join(', ') || 'Configuration updated')
    }
    return json({ ok: true })
  })
}
