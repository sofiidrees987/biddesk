import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth } from '@/lib/api'

/** GET /api/audit — append-only audit trail */
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 60))
    const logs = await db.auditLog.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return json({
      entries: logs.map((l) => ({
        id: l.id, userName: l.userName, userRole: l.userRole, action: l.action,
        entity: l.entity, entityId: l.entityId, entityLabel: l.entityLabel,
        detail: l.detail, createdAt: l.createdAt,
      })),
    })
  })
}
