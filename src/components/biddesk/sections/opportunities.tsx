'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBidStore } from '@/lib/biddesk/store'
import {
  FadeIn, SectionHeader, Pill, StatusPill, EmptyState, ScoreBar, DataTable, FilterInput, KV,
  Money, DateText, type Column, type PillTone,
} from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { fmtMoneyCompact, fmtRelative, NOTICE_TYPES, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  Radar, Plus, Upload, ExternalLink, Bell, BellOff, RotateCcw, TriangleAlert, Loader2,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type MatchFactor = { key: string; label: string; score: number; weight: number; detail: string }

type Opportunity = {
  id: string; source: string; noticeType: string; title: string; solicitationNumber: string;
  agency: string; subTier: string; office: string; postedDate: string | null; responseDeadline: string | null;
  naics: string; psc: string; setAside: string; popCity: string; popState: string; description: string;
  estimatedValueCents: number | null; valueLabel: string; matchScore: number; matchFactors: MatchFactor[];
  status: string; dismissedReason: string
}

type SavedSearch = { id: string; name: string; criteria: Record<string, unknown>; alertsEnabled: boolean; digest: string }

type OpportunitiesData = {
  opportunities: Opportunity[]
  savedSearches: SavedSearch[]
  facets: { noticeTypes: string[]; setAsides: string[]; naics: string[]; agencies: string[] }
}

type ManualForm = {
  title: string; agency: string; naics: string; setAside: string;
  deadline: string; value: string; description: string
}

const EMPTY_MANUAL: ManualForm = {
  title: '', agency: '', naics: '', setAside: 'None', deadline: '', value: '', description: '',
}

const DISMISS_REASONS = ['Outside core capability area', 'No set-aside eligibility', 'No customer relationship', 'Other']

const SET_ASIDE_OPTIONS = ['None', 'Small Business', 'SDVOSB', 'WOSB', '8(a)', 'HUBZone']

/** Set-asides the company qualifies for — these earn the success tone; "None" stays muted. */
const QUALIFYING_SET_ASIDES = new Set(['Small Business', 'SDVOSB', 'WOSB', '8(a)', 'HUBZone'])

function setAsideTone(v: string): PillTone {
  return v && v !== 'None' && QUALIFYING_SET_ASIDES.has(v) ? 'success' : 'muted'
}

const SOURCE_LABELS: Record<string, string> = { sam_gov: 'SAM.gov', manual: 'Manual entry' }

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-')

/** Minimal CSV parser: splits rows/cells, honors double quotes ("" escapes a quote). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  row.push(cell); rows.push(row)
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

/* ------------------------------ match popover ------------------------------ */

function MatchPopover({ score, factors }: { score: number; factors: MatchFactor[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded focus-ring" onClick={(e) => e.stopPropagation()} aria-label="Open match factor breakdown">
          <ScoreBar score={score} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[12px] font-semibold">Match factor breakdown</span>
          <Pill tone={score >= 70 ? 'success' : score >= 45 ? 'warning' : 'danger'}>{score}</Pill>
        </div>
        {factors.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-2">
            No computed factors — manually added opportunities are not scored.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto scroll-thin pr-1 space-y-2.5">
            {factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">{f.label}</span>
                  <span className="tnum text-[12px] font-medium">{f.score}</span>
                </div>
                <ScoreBar score={f.score} className="mt-0.5" />
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <p className="text-[11px] leading-4 text-muted-foreground">{f.detail}</p>
                  <span className="tnum shrink-0 text-[10.5px] text-muted-foreground">Weight {f.weight}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2.5 border-t pt-2 text-[10.5px] text-muted-foreground">
          Score is transparent: every factor is computed from your company profile.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------- facet group ------------------------------- */

function FacetGroup({ title, idPrefix, options, selected, counts, onToggle, label }: {
  title: string
  idPrefix: string
  options: string[]
  selected: string[]
  counts: Map<string, number>
  onToggle: (v: string) => void
  label?: (v: string) => string
}) {
  if (options.length === 0) return null
  return (
    <div className="border-t px-3 py-2.5">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="max-h-40 space-y-1 overflow-y-auto scroll-thin pr-1">
        {options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${slug(opt)}`}
              checked={selected.includes(opt)}
              onCheckedChange={() => onToggle(opt)}
              aria-label={`Filter by ${label ? label(opt) : opt}`}
            />
            <label htmlFor={`${idPrefix}-${slug(opt)}`} className="min-w-0 flex-1 cursor-pointer truncate text-[12.5px] leading-tight">
              {label ? label(opt) : opt}
            </label>
            <span className="tnum shrink-0 text-[10.5px] text-muted-foreground">{counts.get(opt) ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ main section ------------------------------- */

export function OpportunitiesSection() {
  const qc = useQueryClient()
  const paramId = useBidStore((s) => s.params.opportunities?.id)
  const setParam = useBidStore((s) => s.setParam)

  // filters
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [statusTab, setStatusTab] = useState('all')
  const [noticeSel, setNoticeSel] = useState<string[]>([])
  const [asideSel, setAsideSel] = useState<string[]>([])
  const [naicsSel, setNaicsSel] = useState<string[]>([])

  // record selection + dialogs
  const [detailId, setDetailId] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState<ManualForm>(EMPTY_MANUAL)
  const [manualError, setManualError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ total: number; done: number } | null>(null)
  const [dismissTarget, setDismissTarget] = useState<Opportunity | null>(null)
  const [reason, setReason] = useState('')
  const [otherText, setOtherText] = useState('')

  // debounce keyword -> q query param (~300ms)
  useEffect(() => {
    const t = setTimeout(() => setQ(keyword.trim()), 300)
    return () => clearTimeout(t)
  }, [keyword])

  const { data, isLoading } = useQuery<OpportunitiesData>({
    queryKey: ['opportunities', q],
    queryFn: async (): Promise<OpportunitiesData> => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/opportunities?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load opportunities')
      return (await res.json()) as OpportunitiesData
    },
  })

  const allOpps = useMemo(() => data?.opportunities ?? [], [data])

  // status / facet filtering happens client-side so multi-select checkboxes compose
  const filtered = useMemo(() => allOpps.filter((o) =>
    (statusTab === 'all' || o.status === statusTab) &&
    (noticeSel.length === 0 || noticeSel.includes(o.noticeType)) &&
    (asideSel.length === 0 || asideSel.includes(o.setAside)) &&
    (naicsSel.length === 0 || naicsSel.includes(o.naics)),
  ), [allOpps, statusTab, noticeSel, asideSel, naicsSel])

  const noticeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of allOpps) m.set(o.noticeType, (m.get(o.noticeType) ?? 0) + 1)
    return m
  }, [allOpps])
  const asideCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of allOpps) m.set(o.setAside, (m.get(o.setAside) ?? 0) + 1)
    return m
  }, [allOpps])
  const naicsCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of allOpps) m.set(o.naics, (m.get(o.naics) ?? 0) + 1)
    return m
  }, [allOpps])

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const clearFilters = () => {
    setKeyword('')
    setStatusTab('all')
    setNoticeSel([])
    setAsideSel([])
    setNaicsSel([])
  }

  // Deep link: dashboard recommendations and the command palette navigate with {id}.
  const openId = paramId || detailId
  const detail = allOpps.find((o) => o.id === openId) ?? null

  const openDetail = (id: string) => {
    if (paramId) setParam('opportunities', 'id', '')
    setDetailId(id)
  }

  const closeDetail = () => {
    setDetailId(null)
    if (paramId) setParam('opportunities', 'id', '')
  }

  /* ------------------------------- mutations ------------------------------- */

  const track = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', id }),
      })
      if (!res.ok) throw new Error('Track failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({ title: 'Pursuit created — moved to Pipeline at Identified stage', description: 'Match factors carried over as the first PWin estimate.' })
    },
    onError: () => toast({ title: 'Could not track opportunity', variant: 'destructive' }),
  })

  const dismiss = useMutation({
    mutationFn: async ({ id, reason: why }: { id: string; reason: string }) => {
      const res = await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', id, reason: why }),
      })
      if (!res.ok) throw new Error('Dismiss failed')
      return res.json()
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      toast({ title: 'Dismissed with reason — future matches tune to this decision', description: `Reason: ${vars.reason}` })
      setDismissTarget(null)
      setReason('')
      setOtherText('')
    },
    onError: () => toast({ title: 'Could not dismiss opportunity', variant: 'destructive' }),
  })

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id }),
      })
      if (!res.ok) throw new Error('Restore failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      toast({ title: 'Opportunity restored to New' })
    },
    onError: () => toast({ title: 'Could not restore opportunity', variant: 'destructive' }),
  })

  const addManual = useMutation({
    mutationFn: async (form: ManualForm) => {
      const res = await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addManual',
          title: form.title.trim(),
          agency: form.agency.trim() || undefined,
          naics: form.naics.trim() || undefined,
          setAside: form.setAside,
          deadline: form.deadline || undefined,
          value: form.value ? Number(form.value) : undefined,
          description: form.description.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Add failed')
      return res.json()
    },
    onSuccess: (_d, form) => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      toast({ title: 'Opportunity added manually', description: `${form.title.trim()} is available in the New list.` })
      setManualOpen(false)
      setManual(EMPTY_MANUAL)
      setManualError('')
    },
    onError: () => toast({ title: 'Could not add opportunity', description: 'Check the form and try again.', variant: 'destructive' }),
  })

  /* ------------------------------ csv import ------------------------------- */

  const handleImportFile = async (file: File) => {
    const rows = parseCsv(await file.text())
    const hasHeader = rows[0]?.some((c) => c.toLowerCase().includes('title'))
    const dataRows = (hasHeader ? rows.slice(1) : rows).filter((r) => (r[1] ?? '').trim() !== '')
    if (dataRows.length === 0) {
      toast({ title: 'No importable rows found', description: 'Expected columns: solicitation number, title, agency, deadline, NAICS, set-aside, value.' })
      return
    }
    setImportState({ total: dataRows.length, done: 0 })
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]
      const valueNum = parseFloat((r[6] ?? '').replace(/[$,\s]/g, ''))
      await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addManual',
          solicitationNumber: (r[0] ?? '').trim() || undefined,
          title: (r[1] ?? '').trim(),
          agency: (r[2] ?? '').trim() || undefined,
          deadline: (r[3] ?? '').trim() || undefined,
          naics: (r[4] ?? '').trim() || undefined,
          setAside: (r[5] ?? '').trim() || undefined,
          value: Number.isFinite(valueNum) ? valueNum : undefined,
        }),
      })
      setImportState({ total: dataRows.length, done: i + 1 })
    }
    qc.invalidateQueries({ queryKey: ['opportunities'] })
    toast({
      title: `Imported ${dataRows.length} opportunit${dataRows.length === 1 ? 'y' : 'ies'}`,
      description: 'Rows were added as manual-source notices for state and local work.',
    })
    setImportState(null)
    setImportOpen(false)
  }

  /* -------------------------------- columns -------------------------------- */

  const columns: Column<Opportunity>[] = [
    {
      key: 'title', header: 'Title', sortValue: (o) => o.title,
      render: (o) => (
        <div className="min-w-0 max-w-96">
          <div className="line-clamp-1 text-[13px] font-medium leading-4">{o.title}</div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
            <span className="tnum">{o.solicitationNumber}</span> · {o.agency}
          </div>
        </div>
      ),
    },
    {
      key: 'noticeType', header: 'Notice type', sortValue: (o) => o.noticeType,
      render: (o) => <Pill tone="muted">{NOTICE_TYPES[o.noticeType] ?? titleCase(o.noticeType)}</Pill>,
    },
    {
      key: 'setAside', header: 'Set-aside', sortValue: (o) => o.setAside || 'None',
      render: (o) => <Pill tone={setAsideTone(o.setAside)}>{o.setAside || 'None'}</Pill>,
    },
    {
      key: 'deadline', header: 'Response deadline', sortValue: (o) => o.responseDeadline ?? '9999-12-31',
      render: (o) => {
        const rel = fmtRelative(o.responseDeadline)
        const danger = rel.tone === 'past' || rel.tone === 'today' || rel.tone === 'soon'
        return (
          <div>
            <DateText d={o.responseDeadline} />
            <div className="mt-0.5"><Pill tone={danger ? 'danger' : 'muted'}>{rel.text}</Pill></div>
          </div>
        )
      },
    },
    {
      key: 'value', header: 'Value', sortValue: (o) => o.estimatedValueCents ?? 0,
      render: (o) => o.estimatedValueCents != null
        ? <span className="tnum text-[13px]">{fmtMoneyCompact(o.estimatedValueCents)}</span>
        : <span className="tnum text-[13px]">{o.valueLabel || '—'}</span>,
    },
    {
      key: 'match', header: 'Match', sortValue: (o) => o.matchScore,
      render: (o) => <MatchPopover score={o.matchScore} factors={o.matchFactors} />,
    },
    {
      key: 'status', header: 'Status', sortValue: (o) => o.status,
      render: (o) => <StatusPill status={o.status} />,
    },
  ]

  const anyFilter = q !== '' || statusTab !== 'all' || noticeSel.length > 0 || asideSel.length > 0 || naicsSel.length > 0

  /* --------------------------------- render -------------------------------- */

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="flex flex-col gap-4 lg:flex-row">
          <Skeleton className="h-96 w-full lg:w-56 shrink-0" />
          <Skeleton className="h-96 flex-1" />
        </div>
      </div>
    )
  }

  return (
    <FadeIn>
      <SectionHeader
        title="Opportunities"
        description="SAM.gov notices with transparent match scoring. Manual entry and CSV import cover state and local sources."
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => { setManual(EMPTY_MANUAL); setManualError(''); setManualOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> Add manually
            </Button>
          </>
        }
      />

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* Filter sidebar */}
        <aside className="w-full shrink-0 overflow-hidden rounded-lg border bg-card lg:w-56" aria-label="Opportunity filters">
          <div className="border-b p-3">
            <div className="w-full [&_input]:w-full">
              <FilterInput value={keyword} onChange={setKeyword} placeholder="Search notices…" />
            </div>
          </div>
          <div className="border-b px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</div>
            <Tabs value={statusTab} onValueChange={setStatusTab}>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-0.5">
                <TabsTrigger value="all" className="h-6 px-2 text-[11px]">All</TabsTrigger>
                <TabsTrigger value="new" className="h-6 px-2 text-[11px]">New</TabsTrigger>
                <TabsTrigger value="tracked" className="h-6 px-2 text-[11px]">Tracked</TabsTrigger>
                <TabsTrigger value="dismissed" className="h-6 px-2 text-[11px]">Dismissed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <FacetGroup title="Notice type" idPrefix="nt" options={data.facets.noticeTypes} selected={noticeSel}
            counts={noticeCounts} onToggle={(v) => setNoticeSel((l) => toggle(l, v))}
            label={(v) => NOTICE_TYPES[v] ?? titleCase(v)} />
          <FacetGroup title="Set-aside" idPrefix="sa" options={data.facets.setAsides} selected={asideSel}
            counts={asideCounts} onToggle={(v) => setAsideSel((l) => toggle(l, v))} />
          <FacetGroup title="NAICS" idPrefix="na" options={data.facets.naics} selected={naicsSel}
            counts={naicsCounts} onToggle={(v) => setNaicsSel((l) => toggle(l, v))} />
          {data.savedSearches.length > 0 ? (
            <div className="border-t px-3 py-2.5">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saved searches</div>
              <div className="space-y-0.5">
                {data.savedSearches.map((s) => (
                  <button
                    key={s.id}
                    className="focus-ring w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                    onClick={() => toast({
                      title: `Saved search applied: ${s.name}`,
                      description: 'Criteria are illustrative in the demonstration workspace.',
                    })}
                  >
                    <div className="truncate text-[12.5px] font-medium leading-4">{s.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Pill tone="muted">{titleCase(s.digest)}</Pill>
                      {s.alertsEnabled ? (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          <Bell className="h-3 w-3 text-[var(--brand)]" aria-hidden />
                          <span className="sr-only">Alerts enabled</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          <BellOff className="h-3 w-3" aria-hidden />
                          <span className="sr-only">Alerts disabled</span>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        {/* Results */}
        <div className="min-w-0 w-full flex-1" data-tour="opportunities-table">
          <DataTable
            columns={columns}
            rows={filtered}
            onRowClick={(o) => openDetail(o.id)}
            csvName="biddesk-opportunities"
            empty={
              <EmptyState
                icon={<Radar className="h-7 w-7" strokeWidth={1.5} />}
                title={anyFilter ? 'No opportunities match your filters' : 'No opportunities yet'}
                hint={anyFilter
                  ? 'Try clearing the keyword or facet filters to widen the result set.'
                  : 'Connect a SAM.gov API key in Settings to sync federal notices, or add state and local opportunities manually.'}
                action={anyFilter ? (
                  <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={clearFilters}>Clear filters</Button>
                ) : undefined}
              />
            }
          />
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-none sm:w-[25rem]">
          {detail ? (
            <>
              <SheetHeader className="gap-1.5 border-b p-4 pb-3">
                <SheetTitle className="pr-6 text-[15px] font-semibold leading-5">{detail.title}</SheetTitle>
                <SheetDescription className="text-[11.5px] leading-4">
                  <span className="tnum">{detail.solicitationNumber}</span>
                  {' · '}
                  {[detail.agency, detail.subTier, detail.office].filter(Boolean).join(' > ')}
                </SheetDescription>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill tone="muted">{NOTICE_TYPES[detail.noticeType] ?? titleCase(detail.noticeType)}</Pill>
                  <Pill tone={setAsideTone(detail.setAside)}>{detail.setAside || 'None'}</Pill>
                  <StatusPill status={detail.status} />
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto scroll-thin">
                <Tabs defaultValue="overview" className="gap-0">
                  <div className="border-b px-4 py-2">
                    <TabsList className="h-8">
                      <TabsTrigger value="overview" className="h-6 px-2.5 text-[12px]">Overview</TabsTrigger>
                      <TabsTrigger value="match" className="h-6 px-2.5 text-[12px]">Match &amp; Dismissal</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="overview" className="p-4">
                    <div className="space-y-4">
                      <p className="text-[13px] leading-5">
                        {detail.description || 'No description is available for this notice.'}
                      </p>
                      <dl>
                        <KV label="Posted"><DateText d={detail.postedDate} /></KV>
                        <KV label="Response deadline">
                          <span>
                            <DateText d={detail.responseDeadline} />
                            {detail.responseDeadline ? (
                              <span className={cn(
                                'ml-1.5 text-[11px]',
                                fmtRelative(detail.responseDeadline).tone === 'later' ? 'text-muted-foreground' : 'text-[var(--danger)]',
                              )}>
                                {fmtRelative(detail.responseDeadline).text}
                              </span>
                            ) : null}
                          </span>
                        </KV>
                        <KV label="NAICS">{detail.naics || '—'}</KV>
                        <KV label="PSC">{detail.psc || '—'}</KV>
                        <KV label="Place of performance">
                          {[detail.popCity, detail.popState].filter(Boolean).join(', ') || '—'}
                        </KV>
                        <KV label="Estimated value">
                          {detail.estimatedValueCents ? <Money cents={detail.estimatedValueCents} /> : detail.valueLabel || '—'}
                        </KV>
                        <KV label="Source">{SOURCE_LABELS[detail.source] ?? titleCase(detail.source)}</KV>
                      </dl>
                      {detail.source === 'sam_gov' ? (
                        <a
                          href={`https://sam.gov/opp/${encodeURIComponent(detail.solicitationNumber)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring inline-flex items-center gap-1.5 rounded text-[12.5px] font-medium text-[var(--brand)] hover:underline"
                        >
                          View on SAM.gov <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="match" className="p-4">
                    <div className="space-y-3">
                      {detail.matchFactors.length === 0 ? (
                        <p className="text-[12.5px] text-muted-foreground">
                          This opportunity was added manually and has no computed match score.
                        </p>
                      ) : detail.matchFactors.map((f) => (
                        <div key={f.key} className="rounded-md border bg-background/40 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-medium">{f.label}</span>
                            <span className="tnum text-[12.5px] font-medium">{f.score}</span>
                          </div>
                          <ScoreBar score={f.score} className="mt-1" />
                          <div className="mt-1.5 flex items-baseline justify-between gap-2">
                            <p className="text-[11.5px] leading-4 text-muted-foreground">{f.detail}</p>
                            <span className="tnum shrink-0 text-[10.5px] text-muted-foreground">Weight {f.weight}%</span>
                          </div>
                        </div>
                      ))}
                      <p className="border-t pt-2.5 text-[11px] text-muted-foreground">
                        Score is transparent: every factor is computed from your company profile.
                      </p>
                      {detail.status === 'dismissed' ? (
                        <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-bg)] p-3">
                          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--warning)]">
                            <TriangleAlert className="h-3.5 w-3.5" />
                            Dismissed — {detail.dismissedReason || 'No reason recorded'}
                          </div>
                          <Button
                            size="sm" variant="outline"
                            className="mt-2 h-7 gap-1.5 text-[12px]"
                            onClick={() => restore.mutate(detail.id)}
                            disabled={restore.isPending}
                          >
                            {restore.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Restore to New
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <SheetFooter className="flex-row items-center gap-2 border-t bg-card p-3">
                {detail.status === 'new' ? (
                  <>
                    <p className="flex-1 text-[11px] leading-4 text-muted-foreground">
                      Track moves this notice into your Pipeline at the Identified stage.
                    </p>
                    <Button
                      variant="outline" size="sm" className="h-8 text-[12px]"
                      onClick={() => setDismissTarget(detail)}
                      disabled={dismiss.isPending}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm" className="h-8 text-[12px] gap-1.5"
                      onClick={() => track.mutate(detail.id)}
                      disabled={track.isPending}
                    >
                      {track.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Track opportunity
                    </Button>
                  </>
                ) : (
                  <p className="flex-1 text-[11px] leading-4 text-muted-foreground">
                    {detail.status === 'tracked'
                      ? 'Tracked — a pursuit for this notice exists in your Pipeline.'
                      : 'Dismissed — restore it from the Match & Dismissal tab.'}
                  </p>
                )}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Dismiss reason dialog */}
      <Dialog open={!!dismissTarget} onOpenChange={(o) => {
        if (!o) { setDismissTarget(null); setReason(''); setOtherText('') }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss opportunity</DialogTitle>
            <DialogDescription>
              {dismissTarget?.title}. Recording a reason tunes future match scoring and feeds your dismiss history.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
            {DISMISS_REASONS.map((r, i) => (
              <div key={r} className="flex items-start gap-2">
                <RadioGroupItem value={r} id={`dismiss-reason-${i}`} className="mt-0.5" />
                <label htmlFor={`dismiss-reason-${i}`} className="cursor-pointer text-[13px] leading-5">
                  {r}
                  {r === 'Other' && reason === 'Other' ? (
                    <Input
                      className="mt-1.5 h-8 text-[13px]"
                      placeholder="Describe the reason (used instead of the preset)"
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                </label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => { setDismissTarget(null); setReason(''); setOtherText('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive" size="sm" className="h-8 text-[12px]"
              disabled={!reason || dismiss.isPending}
              onClick={() => {
                if (!dismissTarget) return
                const finalReason = reason === 'Other' && otherText.trim() ? otherText.trim() : reason
                dismiss.mutate({ id: dismissTarget.id, reason: finalReason })
              }}
            >
              {dismiss.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add manually dialog */}
      <Dialog open={manualOpen} onOpenChange={(o) => { setManualOpen(o); if (!o) setManualError('') }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scroll-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add opportunity manually</DialogTitle>
            <DialogDescription>
              For state, local, or off-source notices that do not sync from SAM.gov.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="manual-title" className="text-[12px]">Title *</Label>
              <Input
                id="manual-title" className="h-8 text-[13px]"
                placeholder="e.g., Statewide Data Platform Modernization RFP"
                value={manual.title}
                onChange={(e) => { setManual((m) => ({ ...m, title: e.target.value })); setManualError('') }}
              />
              {manualError ? <p className="text-[11.5px] text-[var(--danger)]">{manualError}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="manual-agency" className="text-[12px]">Agency</Label>
                <Input id="manual-agency" className="h-8 text-[13px]" placeholder="e.g., State of Maryland DOIT"
                  value={manual.agency} onChange={(e) => setManual((m) => ({ ...m, agency: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="manual-naics" className="text-[12px]">NAICS</Label>
                <Input id="manual-naics" className="h-8 text-[13px]" placeholder="541512"
                  value={manual.naics} onChange={(e) => setManual((m) => ({ ...m, naics: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Set-aside</Label>
                <Select value={manual.setAside} onValueChange={(v) => setManual((m) => ({ ...m, setAside: v }))}>
                  <SelectTrigger className="h-8 w-full text-[13px]" aria-label="Set-aside">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_ASIDE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="manual-deadline" className="text-[12px]">Response deadline</Label>
                <Input id="manual-deadline" type="date" className="h-8 text-[13px]"
                  value={manual.deadline} onChange={(e) => setManual((m) => ({ ...m, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-value" className="text-[12px]">Estimated value (USD)</Label>
              <Input id="manual-value" type="number" min={0} className="h-8 text-[13px]" placeholder="e.g., 2500000"
                value={manual.value} onChange={(e) => setManual((m) => ({ ...m, value: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-description" className="text-[12px]">Description</Label>
              <Textarea id="manual-description" rows={3} className="text-[13px]"
                placeholder="Scope, period of performance, key requirements…"
                value={manual.description} onChange={(e) => setManual((m) => ({ ...m, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button
              size="sm" className="h-8 text-[12px] gap-1.5"
              disabled={addManual.isPending}
              onClick={() => {
                if (!manual.title.trim()) { setManualError('Title is required'); return }
                addManual.mutate(manual)
              }}
            >
              {addManual.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!importState) setImportOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import opportunities from CSV</DialogTitle>
            <DialogDescription>
              Bulk-add state and local notices that do not sync from SAM.gov.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-[12.5px] leading-5">
            Expected columns, in order:
            <ol className="mt-1 list-inside list-decimal text-muted-foreground">
              <li>Solicitation number</li>
              <li>Title (required)</li>
              <li>Agency</li>
              <li>Deadline (YYYY-MM-DD)</li>
              <li>NAICS</li>
              <li>Set-aside</li>
              <li>Value (USD)</li>
            </ol>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              The first row is skipped when it looks like a header. Quoted values are supported.
            </p>
          </div>
          {importState ? (
            <div className="space-y-2">
              <div className="text-[12.5px] text-muted-foreground">
                Importing {importState.done} of {importState.total}…
              </div>
              <Progress value={(importState.done / importState.total) * 100} />
            </div>
          ) : (
            <Input
              type="file" accept=".csv,text/csv" aria-label="Choose CSV file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleImportFile(f)
                e.target.value = ''
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}
