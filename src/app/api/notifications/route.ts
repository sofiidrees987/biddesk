import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err } from '@/lib/api'

/** GET /api/notifications — the signed-in user's notifications */
export async function GET() {
  return withAuth(async (user) => {
    const notifications = await db.notification.findMany({
      where: { orgId: user.orgId, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return json({
      notifications: notifications.map((n) => ({
        id: n.id, kind: n.kind, title: n.title, body: n.body,
        recordType: n.recordType, recordId: n.recordId, read: n.read, createdAt: n.createdAt,
      })),
      unread: notifications.filter((n) => !n.read).length,
    })
  })
}

/** PATCH /api/notifications — mark read (single or all) */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'Invalid request')
    if (body.all) {
      await db.notification.updateMany({ where: { orgId: user.orgId, userId: user.id }, data: { read: true } })
      return json({ ok: true })
    }
    if (typeof body.id === 'string') {
      await db.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { read: true } })
      return json({ ok: true })
    }
    return err(400, 'Unknown update')
  })
}
