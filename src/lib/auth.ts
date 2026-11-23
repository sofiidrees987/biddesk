import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'biddesk_session'

export type SessionUser = {
  id: string
  orgId: string
  email: string
  name: string
  role: string
  title: string
  initials: string
  mfaEnabled: boolean
}

export function hashPassword(pw: string) {
  return createHash('sha256').update(pw).digest('hex')
}

export async function createSession(userId: string, orgId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  await db.session.create({ data: { token, userId, orgId, expiresAt } })
  return { token, expiresAt }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) return null
    const u = session.user
    return {
      id: u.id, orgId: u.orgId, email: u.email, name: u.name,
      role: u.role, title: u.title, initials: u.initials, mfaEnabled: u.mfaEnabled,
    }
  } catch {
    return null
  }
}

export async function destroySession() {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (token) {
      await db.session.deleteMany({ where: { token } })
    }
  } catch {
    // ignore
  }
}

export async function audit(
  orgId: string,
  userName: string,
  userRole: string,
  action: string,
  entity: string,
  entityId: string,
  entityLabel: string,
  detail = '',
) {
  await db.auditLog.create({
    data: { orgId, userName, userRole, action, entity, entityId, entityLabel, detail },
  })
}
