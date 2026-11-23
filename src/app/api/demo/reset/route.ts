import { json } from '@/lib/api'
import { NextResponse } from 'next/server'

/** POST /api/demo/reset — re-seed the demonstration workspace */
export async function POST(): Promise<NextResponse> {
  const { exec } = await import('child_process')
  return new Promise<NextResponse>((resolve) => {
    exec('bun prisma/seed.ts', { cwd: process.cwd() }, (error) => {
      if (error) {
        console.error('[demo reset]', error)
        resolve(json({ ok: false }, { status: 500 }))
      } else {
        resolve(json({ ok: true }))
      }
    })
  })
}
