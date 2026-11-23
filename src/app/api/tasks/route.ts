import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, withAuth, err } from '@/lib/api'
import { audit } from '@/lib/auth'

/** PATCH /api/tasks — toggle task status */
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return err(400, 'Invalid request')
    const t = await db.task.findFirst({ where: { id: body.id, orgId: user.orgId } })
    if (!t) return err(404, 'Task not found')
    const status = body.status === 'done' || body.status === 'open' ? body.status : (t.status === 'open' ? 'done' : 'open')
    await db.task.update({ where: { id: t.id }, data: { status } })
    if (status === 'done') {
      await audit(user.orgId, user.name, user.role, 'task.completed', 'task', t.id, t.title, '')
    }
    return json({ ok: true, status })
  })
}
