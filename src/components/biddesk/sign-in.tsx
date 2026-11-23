'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoFull } from '@/components/biddesk/logo'
import { useTheme } from 'next-themes'
import { Moon, Sun, Lock, AlertCircle } from 'lucide-react'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || body?.error || 'Sign-in failed')
      }
      await qc.invalidateQueries({ queryKey: ['session'] })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const fill = (e: string) => {
    setEmail(e)
    setPassword('BidDesk2025!')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex justify-end p-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="h-4 w-4 hidden dark:block" />
        </Button>
      </div>
      <main className="flex-1 flex items-center justify-center px-4 pb-24">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoFull height={30} />
            <p className="text-[13px] text-muted-foreground">
              Capture, proposals and contracts for government contractors.
            </p>
          </div>

          <form onSubmit={submit} className="rounded-lg border bg-card p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[13px]">Work email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" autoComplete="username" className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[13px]">Password</Label>
                <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setError('Password reset requires an email server. Contact your administrator or use your identity provider.')}>
                  Forgot password?
                </button>
              </div>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" autoComplete="current-password" className="h-9" />
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger)]" role="alert">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" disabled={busy} className="h-9 w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="border-t pt-3">
              <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Demonstration workspace — sample accounts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Owner', 'dana.whitfield@harborpointtech.com'],
                  ['Capture Mgr', 'marcus.lee@harborpointtech.com'],
                  ['Proposal Mgr', 'priya.nair@harborpointtech.com'],
                  ['Contracts', 'elena.ruiz@harborpointtech.com'],
                  ['Pricing', 'sam.ortiz@harborpointtech.com'],
                ].map(([role, mail]) => (
                  <button key={mail} type="button"
                    onClick={() => fill(mail)}
                    className="rounded-sm border bg-muted/60 px-2 py-1 text-[11px] hover:bg-accent hover:text-accent-foreground transition-colors">
                    {role}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground tnum">
                Shared sample password: BidDesk2025!
              </p>
            </div>
          </form>

          <p className="text-center text-[11px] text-muted-foreground">
            Interactive demonstration. All data shown is sample data.
          </p>
        </div>
      </main>
      <footer className="border-t bg-card py-3 text-center text-[11px] text-muted-foreground">
        BidDesk provides the technical controls; certification and hosting-environment compliance are the deploying organization&apos;s responsibility.
      </footer>
    </div>
  )
}
