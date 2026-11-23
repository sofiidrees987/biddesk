import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, err } from '@/lib/api'
import { createSession, hashPassword, SESSION_COOKIE } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return err(400, 'Invalid request', 'Email and password are required.')
  }
  const user = await db.user.findUnique({ where: { email: body.email.toLowerCase().trim() } })
  if (!user || user.passwordHash !== hashPassword(body.password)) {
    return err(401, 'Sign-in failed', 'Email or password is incorrect.')
  }
  if (!user.active) {
    return err(403, 'Account disabled', 'Contact your organization administrator.')
  }
  const { token, expiresAt } = await createSession(user.id, user.orgId)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires: expiresAt,
    path: '/',
  })
  return json({
    user: {
      id: user.id, orgId: user.orgId, email: user.email, name: user.name,
      role: user.role, title: user.title, initials: user.initials, mfaEnabled: user.mfaEnabled,
    },
  })
}
