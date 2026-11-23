import { db } from '@/lib/db'
import { json, withAuth } from '@/lib/api'

export async function GET() {
  return withAuth(async (user) => {
    const org = await db.organization.findUnique({ where: { id: user.orgId } })
    if (!org) return json({ user }, { status: 200 })
    return json({
      user,
      org: {
        id: org.id, name: org.name, legalName: org.legalName, uei: org.uei, cage: org.cage,
        samExpiry: org.samExpiry, primaryNaics: org.primaryNaics, naicsList: JSON.parse(org.naicsListJson || '[]'),
        sizeStandard: org.sizeStandard, certifications: JSON.parse(org.certificationsJson || '[]'),
        vehicles: JSON.parse(org.vehiclesJson || '[]'), facilityClearance: org.facilityClearance,
        dcaaStatus: org.dcaaStatus, sprsScore: org.sprsScore, sprsDate: org.sprsDate,
        targetAgency: org.targetAgency, firstRunDone: org.firstRunDone, walkthroughSeen: org.walkthroughSeen,
        pwinWeights: JSON.parse(org.pwinWeightsJson || '[]'),
        gateCriteria: JSON.parse(org.gateCriteriaJson || '[]'),
      },
    })
  })
}
