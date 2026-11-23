import { NextResponse } from 'next/server'
import { getSessionUser, type SessionUser } from '@/lib/auth'

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === 'number' ? { status: init } : init)
}

export function err(status: number, title: string, detail?: string) {
  return NextResponse.json({ error: title, detail: detail ?? '' }, { status })
}

/** Wrap a route handler with session auth. Returns the user or a 401 response. */
export async function withAuth(
  handler: (user: SessionUser) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  const user = await getSessionUser()
  if (!user) return err(401, 'Not authenticated', 'Sign in to continue.')
  try {
    return await handler(user)
  } catch (e) {
    console.error('[api]', e)
    return err(500, 'Internal error', e instanceof Error ? e.message : 'Unexpected error')
  }
}

export function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
