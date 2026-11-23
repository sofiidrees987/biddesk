'use client'

import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  SectionHeader, Pill, StatusPill, EmptyState, Money, DateText, FadeIn, FilterInput, KV,
  DataTable, type PillTone, type Column,
} from '@/components/biddesk/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { fmtRelative, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  Building2, ShieldCheck, Truck, Tag, Info, Award, BookOpen, Users, Archive, CheckCircle2,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type Certification = { name: string; expiry?: string }
type Vehicle = { name: string; number: string }

type CompanyProfile = {
  name: string; legalName: string; uei: string; cage: string; samExpiry: string | null
  primaryNaics: string; naicsList: string[]; sizeStandard: string
  certifications: Certification[]; vehicles: Vehicle[]
  facilityClearance: string; dcaaStatus: string; sprsScore: number | null; sprsDate: string | null
}

type PastPerformance = {
  id: string; customer: string; contractNumber: string; title: string; valueCents: number
  startDate: string; endDate: string; role: string; naics: string; psc: string
  tags: string[]; narrative: string; outcomes: string; cparsRating: string
  referenceName: string; referenceContact: string; referencePermission: string; status: string
}

type Resume = {
  id: string; name: string; title: string; lcat: string; clearance: string
  certifications: string[]; years: number; availability: string; summary: string; status: string
}

type LibraryItem = {
  id: string; category: string; title: string; content: string; tags: string[]
  status: string; owner: string; reviewBy: string | null; useCount: number
}

type LibraryData = {
  companyProfile: CompanyProfile | null
  pastPerformances: PastPerformance[]
  resumes: Resume[]
  items: LibraryItem[]
}

/* -------------------------------- helpers --------------------------------- */

const CPARS_TONE: Record<string, PillTone> = {
  Exceptional: 'success', 'Very Good': 'info', Satisfactory: 'muted', Marginal: 'warning', Unsatisfactory: 'danger',
}

function CparsPill({ rating }: { rating: string }) {
  if (!rating) return <span className="text-muted-foreground">—</span>
  return <Pill tone={CPARS_TONE[rating] ?? 'muted'}>{rating}</Pill>
}

function RolePill({ role }: { role: string }) {
  const prime = role.toLowerCase() === 'prime'
  return <Pill tone={prime ? 'info' : 'muted'}>{prime ? 'Prime' : 'Sub'}</Pill>
}

function years(s: string, e: string): string {
  const sy = new Date(s).getFullYear()
  const ey = new Date(e).getFullYear()
  if (Number.isNaN(sy) || Number.isNaN(ey)) return '—'
  return sy === ey ? String(sy) : `${sy} – ${ey}`
}

function LibCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-accent/30 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--info)]" />
      <p className="text-[13px] text-muted-foreground">{children}</p>
    </div>
  )
}

/* ------------------------------- component -------------------------------- */

export function LibrarySection() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [openPP, setOpenPP] = useState<PastPerformance | null>(null)
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null)

  const { data, isLoading } = useQuery<LibraryData>({
    queryKey: ['library', q],
    queryFn: async () => (await fetch(`/api/library${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json(),
    placeholderData: keepPreviousData,
  })

  const patchItem = useMutation({
    mutationFn: async (v: { id: string; status: string }) =>
      fetch('/api/library', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
      }),
    onSuccess: (_res, v) => {
      qc.invalidateQueries({ queryKey: ['library'] })
      setOpenItem(null)
      toast({
        title: 'Status updated',
        description: v.status === 'approved'
          ? 'Item is now eligible for grounded drafting.'
          : 'Item is now ineligible for grounded drafting.',
      })
    },
    onError: () => toast({ title: 'Update failed', description: 'The item status could not be saved. Please try again.', variant: 'destructive' }),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-96" />
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    )
  }

  const profile = data.companyProfile

  return (
    <FadeIn>
      <SectionHeader
        title="Library"
        description="Company profile, past performance, resumes, and approved content — the grounded sources for proposal drafting."
        actions={<FilterInput value={q} onChange={setQ} placeholder="Search library…" />}
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Company Profile</TabsTrigger>
          <TabsTrigger value="past">Past Performance</TabsTrigger>
          <TabsTrigger value="personnel">Personnel</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        {/* ------------------------- Company profile ------------------------- */}
        <TabsContent value="profile" className="mt-3">
          {!profile ? (
            <EmptyState title="No company profile yet" hint="The organization profile provides the grounded identity data used across proposals." icon={<Building2 className="h-7 w-7" strokeWidth={1.5} />} />
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <LibCard title="Identity" icon={<Building2 className="h-4 w-4" />}>
                  <dl>
                    <KV label="Legal name">{profile.legalName}</KV>
                    <KV label="Doing business as">{profile.name}</KV>
                    <KV label="UEI"><span className="font-mono text-[12.5px]">{profile.uei}</span></KV>
                    <KV label="CAGE"><span className="font-mono text-[12.5px]">{profile.cage}</span></KV>
                    <KV label="Size standard">{profile.sizeStandard}</KV>
                  </dl>
                </LibCard>

                <LibCard title="Registrations & certifications" icon={<ShieldCheck className="h-4 w-4" />}>
                  <KV label="SAM registration expires">
                    <span className="inline-flex items-center gap-2">
                      <DateText d={profile.samExpiry} />
                      {profile.samExpiry ? (() => {
                        const rel = fmtRelative(profile.samExpiry)
                        return <Pill tone={rel.tone === 'past' ? 'danger' : rel.tone === 'today' || rel.tone === 'soon' ? 'warning' : 'muted'}>{rel.text}</Pill>
                      })() : null}
                    </span>
                  </KV>
                  <p className="text-[11.5px] text-muted-foreground -mt-0.5 mb-1">Renewal recommended 45 days before expiry.</p>
                  <KV label="Facility clearance">{profile.facilityClearance || '—'}</KV>
                  <KV label="DCAA status">{profile.dcaaStatus || '—'}</KV>
                  <KV label="SPRS score">
                    {profile.sprsScore !== null ? (
                      <span className="tnum">{profile.sprsScore} <span className="text-muted-foreground font-normal">· <DateText d={profile.sprsDate} /></span></span>
                    ) : '—'}
                  </KV>
                  <div className="pt-2">
                    <div className="text-xs text-muted-foreground mb-1.5">Certifications</div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.certifications.length ? profile.certifications.map((c) => (
                        <Pill key={c.name} tone="success">{c.name}</Pill>
                      )) : <span className="text-[13px] text-muted-foreground">None recorded</span>}
                    </div>
                  </div>
                </LibCard>

                <LibCard title="Contract vehicles" icon={<Truck className="h-4 w-4" />}>
                  {profile.vehicles.length ? (
                    <div className="divide-y divide-border/60">
                      {profile.vehicles.map((v) => (
                        <div key={v.name} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                          <span className="text-[13px] font-medium">{v.name}</span>
                          <span className="font-mono text-[12px] text-muted-foreground">{v.number}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[13px] text-muted-foreground">No contract vehicles recorded.</p>}
                </LibCard>

                <LibCard title="NAICS codes" icon={<Tag className="h-4 w-4" />}>
                  <div className="text-[15px] font-semibold tnum">{profile.primaryNaics}</div>
                  <div className="text-[11px] text-muted-foreground mb-3">Primary</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.naicsList.filter((n) => n !== profile.primaryNaics).map((n) => (
                      <Pill key={n} tone="muted" className="tnum">{n}</Pill>
                    ))}
                  </div>
                </LibCard>
              </div>
              <p className="text-[12.5px] text-muted-foreground">Only approved Library items are eligible for grounded drafting by the Assistant.</p>
            </div>
          )}
        </TabsContent>

        {/* -------------------------- Past performance ----------------------- */}
        <TabsContent value="past" className="mt-3" data-tour="library-content">
          {data.pastPerformances.length === 0 ? (
            <EmptyState
              title={q ? 'No past performance matches your search' : 'No past performance records'}
              hint={q ? 'Try a different search term.' : 'Records added from closed contracts appear here and become citable once approved.'}
              icon={<Award className="h-7 w-7" strokeWidth={1.5} />}
            />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.pastPerformances.map((pp) => (
                <button key={pp.id}
                  className="rounded-lg border bg-card p-4 text-left flex flex-col gap-2 hover:border-[var(--brand)] transition-colors focus-ring"
                  onClick={() => setOpenPP(pp)}>
                  <div>
                    <div className="text-[13.5px] font-semibold leading-5">{pp.title}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{pp.customer}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RolePill role={pp.role} />
                    <StatusPill status={pp.status} />
                    <CparsPill rating={pp.cparsRating} />
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold"><Money cents={pp.valueCents} /></span>
                    <span className="tnum text-[12px] text-muted-foreground">{years(pp.startDate, pp.endDate)}</span>
                  </div>
                  {pp.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {pp.tags.slice(0, 4).map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                    </div>
                  ) : null}
                  <p className="text-[12.5px] leading-[1.45] line-clamp-3">{pp.narrative}</p>
                  <p className="text-[12px] leading-[1.4] text-muted-foreground line-clamp-2">{pp.outcomes}</p>
                  <div className="mt-auto pt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="text-[11.5px] text-muted-foreground truncate">Reference: {pp.referenceName || '—'}</span>
                    <Pill tone={pp.referencePermission === 'granted' ? 'success' : 'muted'} className="shrink-0">
                      {titleCase(pp.referencePermission)}
                    </Pill>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- Personnel --------------------------- */}
        <TabsContent value="personnel" className="mt-3">
          <ResumeTable resumes={data.resumes} q={q} />
        </TabsContent>

        {/* ------------------------------ Content ---------------------------- */}
        <TabsContent value="content" className="mt-3">
          <div className="space-y-4">
            <InfoNote>Approved content feeds grounded drafting with citations. Draft items are excluded until approved.</InfoNote>
            {data.items.length === 0 ? (
              <EmptyState
                title={q ? 'No content items match your search' : 'No content items'}
                hint={q ? 'Try a different search term.' : 'Boilerplate, policies, and templates drafted in proposal workspaces are stored here.'}
                icon={<BookOpen className="h-7 w-7" strokeWidth={1.5} />}
              />
            ) : (
              <div className="rounded-lg border bg-card divide-y">
                {data.items.map((it) => (
                  <button key={it.id} className="w-full px-4 py-3 text-left hover:bg-muted/40 focus-ring"
                    onClick={() => setOpenItem(it)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={it.category === 'boilerplate' ? 'info' : it.category === 'policy' ? 'warning' : 'muted'}>
                            {titleCase(it.category)}
                          </Pill>
                          <span className={cn('text-[13px] font-medium', it.status === 'archived' && 'line-through text-muted-foreground')}>
                            {it.title}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                          <span>Owner: {it.owner}</span>
                          <span className="tnum">Used in {it.useCount} draft{it.useCount === 1 ? '' : 's'}</span>
                          <span>Review by <DateText d={it.reviewBy} /></span>
                        </div>
                        {it.tags.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {it.tags.map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0"><StatusPill status={it.status} /></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---------------------- Past performance dialog ---------------------- */}
      <Dialog open={!!openPP} onOpenChange={(o) => !o && setOpenPP(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          {openPP ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{openPP.title}</DialogTitle>
                <DialogDescription className="text-left flex flex-wrap items-center gap-1.5">
                  {openPP.customer}
                  <RolePill role={openPP.role} />
                  <StatusPill status={openPP.status} />
                </DialogDescription>
              </DialogHeader>
              <dl>
                <KV label="Customer">{openPP.customer}</KV>
                <KV label="Contract number"><span className="font-mono text-[12.5px]">{openPP.contractNumber}</span></KV>
                <KV label="Value"><Money cents={openPP.valueCents} /></KV>
                <KV label="Period of performance"><DateText d={openPP.startDate} /> – <DateText d={openPP.endDate} /></KV>
                <KV label="NAICS / PSC"><span className="tnum">{openPP.naics} / {openPP.psc}</span></KV>
                <KV label="CPARS rating"><CparsPill rating={openPP.cparsRating} /></KV>
                <KV label="Reference">
                  <span className="inline-flex items-center gap-2">
                    {openPP.referenceName || '—'}
                    <Pill tone={openPP.referencePermission === 'granted' ? 'success' : 'muted'}>{titleCase(openPP.referencePermission)}</Pill>
                  </span>
                </KV>
                <KV label="Reference contact"><span className="font-mono text-[12px]">{openPP.referenceContact || '—'}</span></KV>
              </dl>
              {openPP.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {openPP.tags.map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                </div>
              ) : null}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Narrative</div>
                <p className="text-[13px] leading-relaxed">{openPP.narrative}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Outcomes</div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{openPP.outcomes}</p>
              </div>
              <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" /> Approving makes this record citable in grounded drafts.
              </p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* --------------------------- Item dialog ---------------------------- */}
      <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          {openItem ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{openItem.title}</DialogTitle>
                <DialogDescription className="text-left flex flex-wrap items-center gap-1.5">
                  <Pill tone={openItem.category === 'boilerplate' ? 'info' : openItem.category === 'policy' ? 'warning' : 'muted'}>
                    {titleCase(openItem.category)}
                  </Pill>
                  <StatusPill status={openItem.status} />
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                <span>Owner: <span className="text-foreground font-medium">{openItem.owner}</span></span>
                <span className="tnum">Used in {openItem.useCount} draft{openItem.useCount === 1 ? '' : 's'}</span>
                <span>Review by <span className="text-foreground font-medium"><DateText d={openItem.reviewBy} /></span></span>
              </div>
              {openItem.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {openItem.tags.map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                </div>
              ) : null}
              <div className="rounded-md bg-muted/40 p-3 max-h-72 overflow-y-auto scroll-thin">
                <p className="text-[13px] leading-relaxed whitespace-pre-line">{openItem.content}</p>
              </div>
              <DialogFooter>
                {openItem.status !== 'archived' ? (
                  <Button variant="outline" className="h-8 text-[12px] gap-1.5" disabled={patchItem.isPending}
                    onClick={() => patchItem.mutate({ id: openItem.id, status: 'archived' })}>
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </Button>
                ) : null}
                {openItem.status !== 'approved' ? (
                  <Button className="h-8 text-[12px] gap-1.5" disabled={patchItem.isPending}
                    onClick={() => patchItem.mutate({ id: openItem.id, status: 'approved' })}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}

/* ------------------------------ resume table ------------------------------ */

function clearanceTone(clearance: string): PillTone {
  if (!clearance || clearance.toLowerCase() === 'none') return 'muted'
  return 'info'
}

function availabilityTone(a: string): PillTone {
  const v = a.toLowerCase()
  if (v.includes('available')) return 'success'
  if (v.includes('day') || v.includes('week')) return 'warning'
  return 'muted'
}

function ResumeTable({ resumes, q }: { resumes: Resume[]; q: string }) {
  const columns: Column<Resume>[] = [
    {
      key: 'person', header: 'Person', className: 'min-w-44',
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10.5px] font-semibold">
              {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-[13px] font-medium leading-4 truncate">{r.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{r.title}</div>
          </div>
        </div>
      ),
    },
    { key: 'lcat', header: 'LCAT', className: 'min-w-36', sortValue: (r) => r.lcat, render: (r) => <span className="text-[12.5px]">{r.lcat}</span> },
    { key: 'years', header: 'Years', sortValue: (r) => r.years, render: (r) => <span className="tnum text-[12.5px]">{r.years}</span> },
    { key: 'clearance', header: 'Clearance', sortValue: (r) => r.clearance, render: (r) => <Pill tone={clearanceTone(r.clearance)}>{r.clearance}</Pill> },
    {
      key: 'certs', header: 'Certifications', className: 'min-w-52',
      sortValue: (r) => r.certifications.join(', '),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.certifications.length ? r.certifications.map((c) => <Pill key={c} tone="muted">{c}</Pill>)
            : <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    { key: 'availability', header: 'Availability', sortValue: (r) => r.availability, render: (r) => <Pill tone={availabilityTone(r.availability)}>{r.availability}</Pill> },
    {
      key: 'summary', header: 'Summary', className: 'min-w-64',
      sortValue: (r) => r.summary,
      render: (r) => <span className="block max-w-80 truncate text-[12.5px] text-muted-foreground" title={r.summary}>{r.summary}</span>,
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusPill status={r.status} /> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={resumes}
      dense
      csvName="personnel"
      empty={
        <EmptyState
          title={q ? 'No personnel match your search' : 'No resumes recorded'}
          hint={q ? 'Try a different search term.' : 'Approved resumes are available as grounded sources for staffing volumes.'}
          icon={<Users className="h-7 w-7" strokeWidth={1.5} />}
        />
      }
    />
  )
}
