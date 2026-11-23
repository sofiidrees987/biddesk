'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SectionHeader, StatCard, Pill, EmptyState, FadeIn, FilterInput, KV,
} from '@/components/biddesk/primitives'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBidStore } from '@/lib/biddesk/store'
import { toast } from '@/hooks/use-toast'
import {
  Star, MapPin, Handshake, FileSignature, Search, Users, Info,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type Teaming = { id: string; pursuitTitle: string; role: string; worksharePct: number }

type Partner = {
  id: string; name: string; uei: string; capabilities: string; certifications: string
  location: string; naics: string; ndaStatus: string; taStatus: string
  performanceRating: number; notes: string; teaming: Teaming[]
}

/* -------------------------------- helpers --------------------------------- */

const NDA_TONE: Record<string, 'success' | 'muted' | 'danger'> = { executed: 'success', none: 'muted', expired: 'danger' }
const TA_TONE: Record<string, 'success' | 'muted' | 'warning'> = { executed: 'success', negotiating: 'warning', none: 'muted' }

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i}
          className={cn('h-3.5 w-3.5', i <= rating ? 'fill-[var(--warning)] text-[var(--warning)]' : 'text-muted-foreground/30')} />
      ))}
    </span>
  )
}

function certs(c: string): string[] {
  return c.split(',').map((s) => s.trim()).filter(Boolean)
}

function TeamingRow({ t }: { t: Teaming }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="truncate">{t.pursuitTitle}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Pill tone="muted">{t.role}</Pill>
        <span className="tnum text-muted-foreground">{t.worksharePct}%</span>
      </span>
    </div>
  )
}

/* ------------------------------- component -------------------------------- */

export function PartnersSection() {
  const qc = useQueryClient()
  const go = useBidStore((s) => s.go)
  const [q, setQ] = useState('')
  const [samOpen, setSamOpen] = useState(false)
  const [openPartner, setOpenPartner] = useState<Partner | null>(null)
  const [edit, setEdit] = useState<{ nda: string; ta: string; notes: string } | null>(null)

  const { data, isLoading } = useQuery<{ partners: Partner[] }>({
    queryKey: ['partners'],
    queryFn: async () => (await fetch('/api/partners')).json(),
  })

  const savePartner = useMutation({
    mutationFn: async (v: { id: string; ndaStatus: string; taStatus: string; notes: string }) =>
      fetch('/api/partners', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] })
      setOpenPartner(null)
      toast({ title: 'Partner record updated' })
    },
    onError: () => toast({ title: 'Update failed', description: 'The partner record could not be saved. Please try again.', variant: 'destructive' }),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    )
  }

  const partners = data.partners.filter((p) => {
    if (!q) return true
    const needle = q.toLowerCase()
    return (
      p.name.toLowerCase().includes(needle) ||
      p.uei.toLowerCase().includes(needle) ||
      p.capabilities.toLowerCase().includes(needle) ||
      p.location.toLowerCase().includes(needle)
    )
  })

  const executedNdas = data.partners.filter((p) => p.ndaStatus === 'executed').length
  const executedTas = data.partners.filter((p) => p.taStatus === 'executed').length
  const avgRating = data.partners.length
    ? data.partners.reduce((s, p) => s + p.performanceRating, 0) / data.partners.length
    : 0

  const openDetail = (p: Partner) => {
    setOpenPartner(p)
    setEdit({ nda: p.ndaStatus, ta: p.taStatus, notes: p.notes })
  }

  const dirty = openPartner && edit &&
    (edit.nda !== openPartner.ndaStatus || edit.ta !== openPartner.taStatus || edit.notes !== openPartner.notes)

  return (
    <FadeIn>
      <SectionHeader
        title="Partners"
        description="Teaming directory with NDA and teaming agreement status. SAM entity search requires the Entity API key (Settings)."
        actions={
          <>
            <FilterInput value={q} onChange={setQ} placeholder="Search partners…" />
            <Button size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => setSamOpen(true)}>
              <Search className="h-3.5 w-3.5" /> Search SAM entities
            </Button>
          </>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Partners" value={data.partners.length} sub="In the teaming directory" />
        <StatCard label="Executed NDAs" value={executedNdas}
          sub={`${data.partners.length - executedNdas} outstanding`} tone={executedNdas === data.partners.length ? 'success' : 'default'} />
        <StatCard label="Executed TAs" value={executedTas}
          sub={`${data.partners.length - executedTas} outstanding`} tone={executedTas === data.partners.length ? 'success' : 'default'} />
        <StatCard label="Avg performance rating" value={avgRating ? avgRating.toFixed(1) : '—'} sub="Out of 5" />
      </div>

      {/* Partner cards */}
      {data.partners.length === 0 ? (
        <EmptyState
          title="No partners recorded"
          hint="Add teaming partners to track NDAs, teaming agreements, and workshare across pursuits."
          icon={<Users className="h-7 w-7" strokeWidth={1.5} />}
        />
      ) : partners.length === 0 ? (
        <EmptyState title="No partners match your search" hint="Try a different name, UEI, capability, or location." icon={<Search className="h-7 w-7" strokeWidth={1.5} />} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-tour="partners-list">
          {partners.map((p) => (
            <button key={p.id}
              className="rounded-lg border bg-card p-4 text-left flex flex-col gap-2 hover:border-[var(--brand)] transition-colors focus-ring"
              onClick={() => openDetail(p)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-5 truncate">{p.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{p.uei}</div>
                </div>
                <Stars rating={p.performanceRating} />
              </div>
              <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" /> {p.location}
              </div>
              <p className="text-[12.5px] leading-[1.45] line-clamp-2">{p.capabilities}</p>
              {certs(p.certifications).length ? (
                <div className="flex flex-wrap gap-1">
                  {certs(p.certifications).map((c) => <Pill key={c} tone="muted">{c}</Pill>)}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={NDA_TONE[p.ndaStatus] ?? 'muted'} className="gap-1">
                  <FileSignature className="h-3 w-3" /> NDA: {p.ndaStatus}
                </Pill>
                <Pill tone={TA_TONE[p.taStatus] ?? 'muted'} className="gap-1">
                  <Handshake className="h-3 w-3" /> TA: {p.taStatus}
                </Pill>
              </div>
              {p.notes ? <p className="text-[12px] leading-[1.4] text-muted-foreground line-clamp-2">{p.notes}</p> : null}
              {p.teaming.length ? (
                <div className="mt-auto border-t border-border/60 pt-2 space-y-1">
                  {p.teaming.slice(0, 2).map((t) => <TeamingRow key={t.id} t={t} />)}
                  {p.teaming.length > 2 ? (
                    <div className="text-[11px] text-muted-foreground">+{p.teaming.length - 2} more pursuit{p.teaming.length - 2 === 1 ? '' : 's'}</div>
                  ) : null}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------- Partner detail ------------------------- */}
      <Dialog open={!!openPartner} onOpenChange={(o) => { if (!o) { setOpenPartner(null); setEdit(null) } }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto scroll-thin">
          {openPartner && edit ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{openPartner.name}</DialogTitle>
                <DialogDescription className="text-left flex items-center gap-2">
                  <span className="font-mono text-[11.5px]">{openPartner.uei}</span>
                  <Stars rating={openPartner.performanceRating} />
                </DialogDescription>
              </DialogHeader>

              <dl>
                <KV label="Location">{openPartner.location}</KV>
                <KV label="NAICS"><span className="tnum">{openPartner.naics}</span></KV>
                <KV label="Certifications">
                  <span className="flex flex-wrap justify-end gap-1">
                    {certs(openPartner.certifications).map((c) => <Pill key={c} tone="muted">{c}</Pill>)}
                  </span>
                </KV>
              </dl>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Capabilities</div>
                <p className="text-[13px] leading-relaxed">{openPartner.capabilities}</p>
              </div>

              {openPartner.teaming.length ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Teaming</div>
                  <div className="rounded-md border divide-y">
                    {openPartner.teaming.map((t) => (
                      <div key={t.id} className="px-3 py-1.5"><TeamingRow t={t} /></div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agreements</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">NDA status</Label>
                    <Select value={edit.nda} onValueChange={(v) => setEdit({ ...edit, nda: v })}>
                      <SelectTrigger className="h-8 w-full text-[13px]" aria-label="NDA status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="executed">Executed</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Teaming agreement status</Label>
                    <Select value={edit.ta} onValueChange={(v) => setEdit({ ...edit, ta: v })}>
                      <SelectTrigger className="h-8 w-full text-[13px]" aria-label="Teaming agreement status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="negotiating">Negotiating</SelectItem>
                        <SelectItem value="executed">Executed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]" htmlFor="partner-notes">Notes</Label>
                  <Textarea id="partner-notes" className="min-h-20 text-[13px]" value={edit.notes}
                    onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                    placeholder="Teaming preferences, points of contact, past collaboration…" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="h-8 text-[12px]" onClick={() => { setOpenPartner(null); setEdit(null) }}>Cancel</Button>
                <Button className="h-8 text-[12px]" disabled={!dirty || savePartner.isPending}
                  onClick={() => savePartner.mutate({ id: openPartner.id, ndaStatus: edit.nda, taStatus: edit.ta, notes: edit.notes })}>
                  Save changes
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ------------------------- SAM entity search ------------------------- */}
      <Dialog open={samOpen} onOpenChange={setSamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left">SAM entity search</DialogTitle>
            <DialogDescription className="text-left">
              Search the SAM.gov Entity Management API to find and import potential teaming partners.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <p className="leading-relaxed">
              SAM.gov Entity Management API search requires an API key configured in Settings → Integrations.
              Manual partner entry is available without a key.
            </p>
            <div className="flex items-start gap-2.5 rounded-md border border-dashed bg-muted/40 px-3 py-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                Manual partner creation is available through your administrator in this demonstration workspace.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 text-[12px]" onClick={() => setSamOpen(false)}>Close</Button>
            <Button className="h-8 text-[12px]" onClick={() => { setSamOpen(false); go('settings') }}>
              Open Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}
