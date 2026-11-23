'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OrgProfile, SessionUser } from '@/components/biddesk/app'
import { useBidStore } from '@/lib/biddesk/store'
import { toast } from '@/hooks/use-toast'
import { Rocket, CheckCircle2 } from 'lucide-react'

/**
 * First-run setup: mirrors the viewer-input form from the product demonstration —
 * company name, primary NAICS, and target agency flow through the whole workspace.
 */
export function WelcomeDialog({ open, onOpenChange, org, user }: {
  open: boolean; onOpenChange: (o: boolean) => void; org: OrgProfile | null; user: SessionUser
}) {
  const [name, setName] = useState(org?.name ?? '')
  const [naics, setNaics] = useState(org?.primaryNaics ?? '541512')
  const [agency, setAgency] = useState(org?.targetAgency ?? 'Department of Veterans Affairs')
  const [step, setStep] = useState(0)
  const qc = useQueryClient()
  const startTour = useBidStore((s) => s.startTour)

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, primaryNaics: naics, targetAgency: agency, firstRunDone: true }),
      })
      if (!res.ok) throw new Error('Could not save your profile')
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['session'] })
      setStep(1)
    },
    onError: (e) => toast({ title: 'Setup failed', description: e.message, variant: 'destructive' }),
  })

  const finish = (withTour: boolean) => {
    onOpenChange(false)
    if (withTour) startTour()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step === 1) finish(false) }}>
      <DialogContent className="sm:max-w-md">
        {step === 0 ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Rocket className="h-4 w-4 text-[var(--brand)]" />
                Set up your workspace
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                Welcome, {user.name.split(' ')[0]}. Three quick answers tune opportunity matching, dashboards, and the Assistant for your business. You can change these later in Settings.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-name" className="text-[13px]">Company name</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" placeholder="Harbor Point Technologies" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-naics" className="text-[13px]">Primary NAICS code</Label>
                <Input id="org-naics" value={naics} onChange={(e) => setNaics(e.target.value)} className="h-9" placeholder="541512" />
                <p className="text-[11px] text-muted-foreground">Drives NAICS match scoring on opportunity notices.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-agency" className="text-[13px]">Target agency</Label>
                <Input id="org-agency" value={agency} onChange={(e) => setAgency(e.target.value)} className="h-9" placeholder="Department of Veterans Affairs" />
                <p className="text-[11px] text-muted-foreground">Used for market focus and recommended opportunities.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
                {save.isPending ? 'Saving…' : 'Continue'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                Workspace ready
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                Your workspace is tuned for <span className="font-medium text-foreground">{name}</span> (NAICS {naics}, targeting {agency}).
                The demonstration data is already loaded — explore freely or take the guided walkthrough of the full lifecycle.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => finish(false)}>Explore on my own</Button>
              <Button onClick={() => finish(true)}>Start walkthrough</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
