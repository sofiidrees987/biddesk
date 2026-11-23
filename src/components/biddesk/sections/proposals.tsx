'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBidStore } from '@/lib/biddesk/store'
import { useSession } from '@/components/biddesk/app'
import {
  SectionHeader, StatCard, Pill, StatusPill, EmptyState, CoverageMeter, ScoreBar,
  DataTable, FilterInput, KV, FadeIn, DateText, SampleTag,
  type Column, type PillTone,
} from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { fmtDateTime, REQ_KINDS, SECTION_STATUS, PROPOSAL_STATUS, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  ChevronLeft, ChevronRight, X, FileText, Upload, Sparkles, ShieldCheck, CheckCircle2,
  TriangleAlert, XCircle, Circle, Loader2, Download, Link2, BookOpen, ListChecks,
  ClipboardList, StickyNote,
} from 'lucide-react'

/* ------------------------------------------------------------------ types */

type ProposalListItem = {
  id: string; title: string; solicitationNumber: string; agency: string; status: string
  dueAt: string; contractType: string; daysRemaining: number; coveragePct: number
  requirementCount: number; sectionsTotal: number; sectionsFinal: number; pursuitTitle: string
}

type Requirement = {
  id: string; ref: string; text: string; obligation: string; kind: string
  sourceDoc: string; page: number; paragraph: string; sourceExcerpt: string
  confidence: number; status: string; sectionKey: string; owner: string
}

type ProposalSection = {
  id: string; volume: string; key: string; title: string; instructions: string
  pageLimit: number | null; content: string; assignee: string; dueDate: string | null
  status: string; order: number; winTheme: string; wordCount: number
}

type ReviewFinding = {
  id: string; sectionKey: string; severity: string; comment: string; disposition: string; response: string
}

type ReviewSummary = {
  findingsTotal?: number; findingsOpen?: number; blockers?: number
  avgScore?: number; notes?: string
}

type ReviewCycle = {
  id: string; kind: string; status: string; scheduledAt: string
  summary: ReviewSummary | null
  findings: ReviewFinding[]
}

type ProposalDetail = {
  id: string; title: string; solicitationNumber: string; agency: string; status: string
  dueAt: string; contractType: string; notes: string
  pursuit: { id: string; title: string; pwin: number; stage: string } | null
  requirements: Requirement[]
  sections: ProposalSection[]
  reviewCycles: ReviewCycle[]
}

type DraftSource = {
  id: string; type: 'requirement' | 'library' | 'past_performance'; ref: string; title: string; excerpt: string
}

type DraftResponse =
  | { status: 'draft'; draft: string; sources: DraftSource[]; engine: string }
  | { status: 'needs_input'; missing: string[] }

type ProposalPatch =
  | { id: string; requirement: { id: string; status?: string; sectionKey?: string } }
  | { id: string; section: { id: string; content?: string; status?: string } }
  | { id: string; finding: { id: string; disposition: string; response?: string } }
  | { id: string; review: { id: string; action: 'start' | 'complete' } }
  | { id: string; status: string }

/* ------------------------------------------------------------- constants */

const VOLUME_ORDER = ['Technical', 'Management', 'Past Performance', 'Price', 'Submission']
const WORDS_PER_PAGE = 500

const REQ_STATUS_OPTIONS = ['extracted', 'confirmed', 'edited', 'rejected'] as const
const KIND_OPTIONS = ['instruction', 'evaluation', 'sow_task', 'deliverable', 'clause'] as const

const REVIEW_KINDS: Record<string, { label: string; dot: string }> = {
  blue: { label: 'Blue Team', dot: 'var(--info)' },
  pink: { label: 'Pink Team', dot: '#DB2777' },
  red: { label: 'Red Team', dot: 'var(--danger)' },
  gold: { label: 'Gold Team', dot: 'var(--warning)' },
}

const SOURCE_LABELS: Record<DraftSource['type'], string> = {
  requirement: 'Requirement', library: 'Library', past_performance: 'Past Performance',
}
const SOURCE_TONES: Record<DraftSource['type'], PillTone> = {
  requirement: 'info', library: 'muted', past_performance: 'success',
}
const SEVERITY_TONES: Record<string, PillTone> = { blocker: 'danger', major: 'warning', minor: 'muted' }

const SECTION_DOTS: Record<string, string> = {
  not_started: 'var(--muted-foreground)',
  drafting: 'var(--info)',
  in_review: 'var(--warning)',
  final: 'var(--success)',
}

const UPLOAD_STAGES = [
  'Extracting text from PDF…',
  'Classifying documents (Section L, M, PWS, CDRLs, clauses)…',
  'Extracting requirements with page and paragraph citations…',
  'De-duplicating and building the compliance matrix…',
  'Annotating outline (volumes, page limits, Section M factors)…',
]

/* --------------------------------------------------------------- helpers */

function daysUntil(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000)
}

function duePill(days: number): { label: string; tone: PillTone } {
  if (days < 0) return { label: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'danger' }
  if (days === 0) return { label: 'Due today', tone: 'danger' }
  if (days <= 7) return { label: `${days} days left`, tone: 'danger' }
  if (days <= 21) return { label: `${days} days left`, tone: 'warning' }
  return { label: `${days} days left`, tone: 'muted' }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const v = parts.map((p) => p[0]?.toUpperCase() ?? '').join('')
  return v || '—'
}

function wordCountOf(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function coverageOf(reqs: Requirement[]): { confirmed: number; total: number; pct: number } {
  const total = reqs.filter((r) => r.status !== 'rejected').length
  const confirmed = reqs.filter((r) => r.status === 'confirmed' || r.status === 'edited').length
  return { confirmed, total, pct: total ? Math.round((confirmed / total) * 100) : 0 }
}

function statusCounts(reqs: Requirement[]): Record<string, number> {
  const c: Record<string, number> = { extracted: 0, confirmed: 0, edited: 0, rejected: 0 }
  for (const r of reqs) if (r.status in c) c[r.status] += 1
  return c
}

function docGroupKey(sourceDoc: string): string {
  if (/^CDRL/i.test(sourceDoc)) return 'CDRL'
  if (/^FAR/i.test(sourceDoc)) return 'FAR'
  return sourceDoc
}

const DOC_GROUP_ORDER: Record<string, number> = { 'Section L': 0, 'Section M': 1, PWS: 2, CDRL: 3, FAR: 4 }

type DocGroup = { key: string; label: string; count: number; minPage: number; maxPage: number }

function docGroupsOf(reqs: Requirement[]): DocGroup[] {
  const byKey = new Map<string, Requirement[]>()
  for (const r of reqs) {
    const k = docGroupKey(r.sourceDoc)
    byKey.set(k, [...(byKey.get(k) ?? []), r])
  }
  const groups: DocGroup[] = []
  for (const [key, list] of byKey) {
    const pages = list.map((r) => r.page)
    let label = key
    if (key === 'CDRL') {
      const docs = Array.from(new Set(list.map((r) => r.sourceDoc))).sort()
      if (docs.length > 1) {
        const first = docs[0].replace(/^CDRL\s*/i, '')
        const last = docs[docs.length - 1].replace(/^CDRL\s*/i, '')
        label = `CDRL ${first}–${last}`
      } else {
        label = docs[0] ?? 'CDRLs'
      }
    } else if (key === 'FAR') {
      label = 'FAR clauses'
    }
    groups.push({ key, label, count: list.length, minPage: Math.min(...pages), maxPage: Math.max(...pages) })
  }
  groups.sort((a, b) =>
    (DOC_GROUP_ORDER[a.key] ?? 90) - (DOC_GROUP_ORDER[b.key] ?? 90) || a.label.localeCompare(b.label))
  return groups
}

/** Renders draft text with [S1]-style citation tokens highlighted as chips. */
function DraftCitations({ text }: { text: string }) {
  const parts = text.split(/(\[S\d+\])/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\[S\d+\]$/.test(part) ? (
          <sup key={i} className="mx-0.5 rounded-sm bg-[var(--info-bg)] px-1 text-[9.5px] font-semibold leading-[1.4] text-[var(--info)]">
            {part}
          </sup>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/* ----------------------------------------------------------------- hooks */

function useInvalidateProposal(proposalId: string) {
  const qc = useQueryClient()
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ['proposal', proposalId] })
    qc.invalidateQueries({ queryKey: ['proposals'] })
  }, [qc, proposalId])
}

function useProposalPatch(proposalId: string) {
  const invalidate = useInvalidateProposal(proposalId)
  return useMutation({
    mutationFn: async (payload: ProposalPatch) => {
      const res = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Update failed')
      return (await res.json()) as { ok?: boolean }
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: 'Update failed', description: 'The change could not be saved. Try again.', variant: 'destructive' }),
  })
}

/* ------------------------------------------------------------------ root */

export function ProposalsSection() {
  const id = useBidStore((s) => s.params.proposals?.id)
  return id ? <ProposalWorkspace key={id} proposalId={id} /> : <ProposalList />
}

/* ------------------------------------------------------------------ list */

function ProposalList() {
  const go = useBidStore((s) => s.go)
  const { data, isLoading } = useQuery<{ proposals: ProposalListItem[] }>({
    queryKey: ['proposals'],
    queryFn: async () => (await fetch('/api/proposals')).json(),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const proposals = data.proposals
  const inProgress = proposals.filter((p) => !['submitted', 'won', 'lost'].includes(p.status))
  const avgCoverage = inProgress.length
    ? Math.round(inProgress.reduce((s, p) => s + p.coveragePct, 0) / inProgress.length)
    : 0
  const nextDue = inProgress.length ? inProgress.reduce((a, b) => (new Date(a.dueAt).getTime() <= new Date(b.dueAt).getTime() ? a : b)) : null

  const columns: Column<ProposalListItem>[] = [
    {
      key: 'title', header: 'Proposal', className: 'min-w-56',
      sortValue: (r) => r.title,
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-4 truncate">{r.title}</div>
          <div className="tnum text-[11px] text-muted-foreground mt-0.5">{r.solicitationNumber}</div>
        </div>
      ),
    },
    {
      key: 'agency', header: 'Agency', className: 'w-48',
      sortValue: (r) => r.agency,
      render: (r) => <span className="text-[12.5px] text-muted-foreground">{r.agency}</span>,
    },
    {
      key: 'status', header: 'Status', className: 'w-28',
      sortValue: (r) => r.status,
      render: (r) => <StatusPill status={r.status} label={PROPOSAL_STATUS[r.status] ?? titleCase(r.status)} />,
    },
    {
      key: 'coverage', header: 'Compliance coverage', className: 'w-44',
      sortValue: (r) => r.coveragePct,
      render: (r) => <CoverageMeter value={r.coveragePct} label={`${r.requirementCount} reqs`} />,
    },
    {
      key: 'sections', header: 'Sections', className: 'w-28',
      sortValue: (r) => `${r.sectionsFinal}/${r.sectionsTotal}`,
      render: (r) => <span className="tnum text-[12.5px]">{r.sectionsFinal}/{r.sectionsTotal} final</span>,
    },
    {
      key: 'due', header: 'Due', className: 'w-44',
      sortValue: (r) => r.dueAt,
      render: (r) => {
        const due = duePill(r.daysRemaining)
        return (
          <div className="flex items-center gap-2">
            <DateText d={r.dueAt} className="text-[12.5px]" />
            <Pill tone={due.tone}>{due.label}</Pill>
          </div>
        )
      },
    },
  ]

  return (
    <FadeIn>
      <div data-tour="proposals-list">
        <SectionHeader
          title="Proposals"
          description="Compliance-driven workspaces from solicitation intake through submission."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="In progress" value={inProgress.length} sub="Active workspaces from intake to submission" />
          <StatCard
            label="Average compliance coverage"
            value={inProgress.length ? `${avgCoverage}%` : '—'}
            sub="Confirmed requirements across in-progress proposals"
            tone={avgCoverage >= 85 ? 'success' : avgCoverage >= 60 ? 'default' : 'warning'}
          />
          {nextDue ? (
            <StatCard
              label="Next due"
              value={duePill(nextDue.daysRemaining).label}
              sub={nextDue.title}
              tone={nextDue.daysRemaining <= 7 ? 'danger' : nextDue.daysRemaining <= 21 ? 'warning' : 'default'}
            />
          ) : (
            <StatCard label="Next due" value="—" sub="No in-progress proposals" />
          )}
        </div>

        <DataTable
          columns={columns}
          rows={proposals}
          csvName="proposals"
          onRowClick={(r) => go('proposals', { id: r.id })}
          empty={
            <EmptyState
              title="No proposals yet"
              hint="Track an opportunity and complete its bid decision to open a proposal workspace with intake, compliance matrix, and outline."
              icon={<FileText className="h-7 w-7" strokeWidth={1.5} />}
              action={<Button size="sm" className="h-8" onClick={() => go('opportunities')}>Find opportunities</Button>}
            />
          }
        />
      </div>
    </FadeIn>
  )
}

/* ------------------------------------------------------------- workspace */

function ProposalWorkspace({ proposalId }: { proposalId: string }) {
  const go = useBidStore((s) => s.go)
  const [tab, setTab] = useState<string>('outline')
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
  const [docFilter, setDocFilter] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ proposal: ProposalDetail }>({
    queryKey: ['proposal', proposalId],
    queryFn: async () => (await fetch(`/api/proposals?id=${encodeURIComponent(proposalId)}`)).json(),
  })

  const jumpToDoc = (docKey: string) => {
    setDocFilter(docKey)
    setSelectedReqId(null)
    setTab('matrix')
  }

  const jumpToRequirement = (reqId: string) => {
    setDocFilter(null)
    setSelectedReqId(reqId)
    setTab('matrix')
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    )
  }

  const p = data?.proposal
  if (!p) {
    return (
      <FadeIn>
        <Button variant="ghost" size="sm" className="h-7 px-1.5 -ml-1.5 text-[12px] gap-1 text-muted-foreground" onClick={() => go('proposals', {})}>
          <ChevronLeft className="h-4 w-4" /> Proposals
        </Button>
        <div className="mt-8">
          <EmptyState
            title="Proposal not found"
            hint="This proposal may have been removed. Return to the proposals list and select a record."
            action={<Button size="sm" className="h-8" onClick={() => go('proposals', {})}>Back to proposals</Button>}
          />
        </div>
      </FadeIn>
    )
  }

  const coverage = coverageOf(p.requirements)
  const sections = [...p.sections].sort((a, b) => a.order - b.order)
  const drafted = sections.filter((s) => s.status !== 'not_started').length
  const days = daysUntil(p.dueAt)
  const due = duePill(days)
  const docGroups = docGroupsOf(p.requirements)

  return (
    <FadeIn k={p.id}>
      {/* Header */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="h-7 px-1.5 -ml-1.5 text-[12px] gap-1 text-muted-foreground" onClick={() => go('proposals', {})}>
          <ChevronLeft className="h-4 w-4" /> Proposals
        </Button>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{p.title}</h1>
              <StatusPill status={p.status} label={PROPOSAL_STATUS[p.status] ?? titleCase(p.status)} />
              <Pill tone={due.tone}>{due.label}</Pill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="tnum font-medium text-foreground/80">{p.solicitationNumber}</span>
              <span aria-hidden>·</span>
              <span>{p.agency}</span>
              <span aria-hidden>·</span>
              <span>Due {fmtDateTime(p.dueAt)}</span>
              <span aria-hidden>·</span>
              <span>{p.contractType || 'Contract type not set'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <CoverageMeter value={coverage.pct} label="Compliance coverage" />
            <div className="min-w-36">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>Sections drafted</span>
                <span className="tnum font-medium text-foreground">{drafted}/{sections.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--brand)] transition-all duration-500"
                  style={{ width: `${sections.length ? Math.round((drafted / sections.length) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {p.pursuit ? (
          <div className="mt-3">
            <button
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-[12px] hover:bg-muted focus-ring"
              onClick={() => go('pipeline', { id: p.pursuit!.id })}
              title="Open the linked pursuit"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground shrink-0">Pursuit:</span>
              <span className="font-medium truncate">{p.pursuit.title}</span>
              <span className="tnum text-muted-foreground shrink-0">— PWin {p.pursuit.pwin}%</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Workspace tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto scroll-thin">
          <TabsTrigger value="solicitation" className="text-[12.5px]">Solicitation</TabsTrigger>
          <TabsTrigger value="matrix" className="text-[12.5px]">Compliance Matrix</TabsTrigger>
          <TabsTrigger value="outline" className="text-[12.5px]">Outline &amp; Writing</TabsTrigger>
          <TabsTrigger value="reviews" className="text-[12.5px]">Reviews</TabsTrigger>
          <TabsTrigger value="submission" className="text-[12.5px]">Submission</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitation" className="mt-4">
          <SolicitationTab p={p} docGroups={docGroups} onViewDocReqs={jumpToDoc} />
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <ComplianceMatrixTab
            p={p}
            sections={sections}
            docGroups={docGroups}
            docFilter={docFilter}
            onClearDocFilter={() => setDocFilter(null)}
            selectedReqId={selectedReqId}
            onSelectReq={setSelectedReqId}
          />
        </TabsContent>

        {/* forceMount keeps the editor's draft and unsaved text alive across tab switches */}
        <TabsContent value="outline" className="mt-4" forceMount>
          <div className={cn(tab !== 'outline' && 'hidden')}>
            <WritingTab
              p={p}
              sections={sections}
              selectedSectionId={selectedSectionId}
              onSelectSection={setSelectedSectionId}
              onJumpToRequirement={jumpToRequirement}
            />
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewsTab p={p} sections={sections} />
        </TabsContent>

        <TabsContent value="submission" className="mt-4">
          <SubmissionTab p={p} onNavigate={setTab} />
        </TabsContent>
      </Tabs>
    </FadeIn>
  )
}

/* ------------------------------------------------------- tab 1: intake */

function SolicitationTab({
  p, docGroups, onViewDocReqs,
}: {
  p: ProposalDetail
  docGroups: DocGroup[]
  onViewDocReqs: (docKey: string) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Source documents */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Source documents
          </h3>
          <Pill tone="muted">{docGroups.length} document{docGroups.length === 1 ? '' : 's'}</Pill>
        </div>
        {docGroups.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No source documents yet. Requirements are extracted from the solicitation during intake and grouped
            by document here.
          </div>
        ) : (
          <div className="divide-y">
            {docGroups.map((g) => (
              <div key={g.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{g.label}</div>
                  <div className="tnum text-[11px] text-muted-foreground mt-0.5">
                    {g.count} requirement{g.count === 1 ? '' : 's'} · {g.minPage === g.maxPage ? `page ${g.minPage}` : `pages ${g.minPage}–${g.maxPage}`}
                  </div>
                </div>
                <Pill tone="muted" className="border-dashed shrink-0">Sample upload</Pill>
                <Button
                  variant="ghost" size="sm" className="h-7 text-[12px] gap-1 shrink-0"
                  onClick={() => onViewDocReqs(g.key)}
                >
                  View requirements <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload / intake simulation */}
      <UploadSimulation p={p} requirementCount={p.requirements.length} docCount={docGroups.length} />

      {/* Notes */}
      <div className="rounded-lg border bg-card lg:col-span-2">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" /> Notes
          </h3>
          <SampleTag />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <blockquote className="border-l-2 border-[var(--brand)] pl-3 text-[13px] leading-5 italic text-muted-foreground">
            {p.notes || 'No notes recorded for this proposal.'}
          </blockquote>
          <dl>
            <KV label="Contract type">{p.contractType || '—'}</KV>
            <KV label="Due">{fmtDateTime(p.dueAt)}</KV>
            {p.pursuit ? <KV label="Pursuit PWin">{p.pursuit.pwin}%</KV> : <KV label="Pursuit">Not linked</KV>}
          </dl>
        </div>
      </div>
    </div>
  )
}

function UploadSimulation({
  p, requirementCount, docCount,
}: {
  p: ProposalDetail
  requirementCount: number
  docCount: number
}) {
  const invalidate = useInvalidateProposal(p.id)
  const [state, setState] = useState<{ phase: 'idle' | 'running' | 'done'; progress: number }>({ phase: 'idle', progress: 0 })

  // ~4-second staged animation: progress ticks every 80ms (+2 each), completion at 4s.
  useEffect(() => {
    if (state.phase !== 'running') return
    const tick = setInterval(() => {
      setState((s) => (s.phase === 'running' ? { ...s, progress: Math.min(100, s.progress + 2) } : s))
    }, 80)
    const finish = setTimeout(() => {
      setState({ phase: 'done', progress: 100 })
      toast({
        title: 'Intake complete',
        description: `${requirementCount} requirements extracted across ${docCount} documents. Compliance matrix refreshed.`,
      })
      invalidate()
    }, 4000)
    return () => {
      clearInterval(tick)
      clearTimeout(finish)
    }
  }, [state.phase, requirementCount, docCount, invalidate])

  const running = state.phase === 'running'
  const stageIndex = Math.min(UPLOAD_STAGES.length - 1, Math.floor(state.progress / (100 / UPLOAD_STAGES.length)))

  return (
    <div className="rounded-lg border bg-card" data-tour="upload-simulation">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" /> Upload solicitation
        </h3>
        <SampleTag />
      </div>
      <div className="p-4">
        <button
          type="button"
          disabled={running}
          onClick={() => setState({ phase: 'running', progress: 0 })}
          className={cn(
            'w-full rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-ring',
            running ? 'cursor-wait border-border opacity-80' : 'cursor-pointer border-input hover:border-[var(--brand)] hover:bg-accent/40',
          )}
          aria-label="Run the solicitation intake simulation"
        >
          {state.phase === 'idle' ? (
            <span className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-[13px] font-medium">Drop the solicitation PDF here, or click to run intake</span>
              <span className="max-w-md text-[12px] leading-4 text-muted-foreground">
                Sample simulation: text extraction, document classification (Section L, M, PWS, CDRLs, clauses),
                requirement extraction with citations, and outline annotation.
              </span>
            </span>
          ) : (
            <span className="block w-full text-left space-y-3">
              {/* Simulated file row */}
              <span className="flex items-center gap-2.5 rounded-md border bg-background px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-[12.5px] font-medium">{p.solicitationNumber}_RFP.pdf</span>
                <span className="tnum shrink-0 text-[11px] text-muted-foreground">4.2 MB</span>
                <Pill tone="muted" className="ml-auto border-dashed shrink-0">Sample</Pill>
              </span>

              {running ? (
                <>
                  <span className="block">
                    <span className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Processing</span>
                      <span className="tnum font-medium text-foreground">{state.progress}%</span>
                    </span>
                    <span className="block h-1.5 rounded-full bg-muted overflow-hidden">
                      <span className="block h-full rounded-full bg-[var(--brand)] transition-all duration-150" style={{ width: `${state.progress}%` }} />
                    </span>
                  </span>
                  <span className="block space-y-1.5">
                    {UPLOAD_STAGES.map((s, i) => (
                      <span key={s} className={cn('flex items-center gap-2 text-[12px]', i === stageIndex ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {i < stageIndex ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                        ) : i === stageIndex ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--brand)]" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 opacity-40" />
                        )}
                        {s}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="flex flex-col items-center gap-1.5 py-2 text-center">
                  <CheckCircle2 className="h-6 w-6 text-[var(--success)]" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">
                    Intake complete — {requirementCount} requirements across {docCount} documents
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    Requirements are verified in the compliance matrix. Click to run the sample intake again.
                  </span>
                </span>
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

/* --------------------------------------------- tab 2: compliance matrix */

function ComplianceMatrixTab({
  p, sections, docGroups, docFilter, onClearDocFilter, selectedReqId, onSelectReq,
}: {
  p: ProposalDetail
  sections: ProposalSection[]
  docGroups: DocGroup[]
  docFilter: string | null
  onClearDocFilter: () => void
  selectedReqId: string | null
  onSelectReq: (id: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')

  const counts = statusCounts(p.requirements)
  const coverage = coverageOf(p.requirements)
  const docLabel = (key: string) => docGroups.find((g) => g.key === key)?.label ?? key

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return p.requirements.filter((r) => {
      if (docFilter && docGroupKey(r.sourceDoc) !== docFilter) return false
      if (kind !== 'all' && r.kind !== kind) return false
      if (status !== 'all' && r.status !== status) return false
      if (query) {
        const hay = `${r.ref} ${r.text} ${r.sourceDoc}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
  }, [p.requirements, q, kind, status, docFilter])

  const selectedReq = selectedReqId ? p.requirements.find((r) => r.id === selectedReqId) ?? null : null

  if (p.requirements.length === 0) {
    return (
      <EmptyState
        title="No requirements extracted yet"
        hint="Run the solicitation intake on the Solicitation tab to extract requirements with page and paragraph citations, then verify each row here."
        icon={<ListChecks className="h-7 w-7" strokeWidth={1.5} />}
      />
    )
  }

  const columns: Column<Requirement>[] = [
    {
      key: 'ref', header: 'Ref', className: 'w-24 font-mono text-[12px]',
      sortValue: (r) => r.ref,
      render: (r) => <span className="font-mono text-[12px] font-semibold">{r.ref}</span>,
    },
    {
      key: 'text', header: 'Requirement', className: 'min-w-64',
      sortValue: (r) => r.text,
      render: (r) => (
        <span className="line-clamp-2 max-w-lg text-[12.5px] leading-4" title={r.text}>{r.text}</span>
      ),
    },
    {
      key: 'kind', header: 'Kind', className: 'w-36',
      sortValue: (r) => r.kind,
      render: (r) => <Pill tone="muted">{REQ_KINDS[r.kind] ?? titleCase(r.kind)}</Pill>,
    },
    {
      key: 'obligation', header: 'Obligation', className: 'w-24',
      sortValue: (r) => r.obligation,
      render: (r) => <Pill tone={r.obligation === 'shall' ? 'info' : 'muted'}>{titleCase(r.obligation)}</Pill>,
    },
    {
      key: 'source', header: 'Source', className: 'w-40',
      sortValue: (r) => `${r.sourceDoc} p.${r.page}`,
      render: (r) => (
        <span className="tnum text-[12px] text-muted-foreground">{r.sourceDoc} p.{r.page} ¶{r.paragraph}</span>
      ),
    },
    {
      key: 'status', header: 'Status', className: 'w-28',
      sortValue: (r) => r.status,
      render: (r) => <StatusPill status={r.status} />,
    },
  ]

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-start" data-tour="compliance-matrix">
      <div className="flex-1 min-w-0 w-full space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterInput value={q} onChange={setQ} placeholder="Filter ref, text, or source…" />
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger size="sm" className="h-8 w-44 text-[12px]" aria-label="Filter by kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All kinds</SelectItem>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k} value={k} className="text-[12px]">{REQ_KINDS[k] ?? titleCase(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="h-8 w-36 text-[12px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All statuses</SelectItem>
              {REQ_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-[12px]">{titleCase(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {docFilter ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-md border bg-accent/60 h-8 px-2.5 text-[12px] font-medium text-[var(--accent-foreground)] hover:bg-accent focus-ring"
              onClick={onClearDocFilter}
              title="Clear the source document filter"
            >
              <FileText className="h-3 w-3" />
              {docLabel(docFilter)}
              <X className="h-3 w-3" />
            </button>
          ) : null}
          <span className="ml-auto tnum text-[12px] text-muted-foreground">
            {coverage.total} requirements · {coverage.confirmed} confirmed · {coverage.pct}% coverage
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          <Pill tone="info">{counts.extracted} extracted</Pill>
          <Pill tone="success">{counts.confirmed} confirmed</Pill>
          <Pill tone="success">{counts.edited} edited</Pill>
          <Pill tone="danger">{counts.rejected} rejected</Pill>
          <div className="ml-auto">
            <CoverageMeter value={coverage.pct} label="Verified coverage" />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          dense
          maxH="60vh"
          csvName="compliance-matrix"
          onRowClick={(r) => onSelectReq(r.id)}
          empty={
            <EmptyState
              title="No requirements match the current filters"
              hint="Adjust the search, kind, or status filters to see more of the compliance matrix."
              action={
                <Button variant="outline" size="sm" className="h-8" onClick={() => { setQ(''); setKind('all'); setStatus('all'); onClearDocFilter() }}>
                  Clear filters
                </Button>
              }
            />
          }
        />
      </div>

      {selectedReq ? (
        <CitationPanel
          p={p}
          req={selectedReq}
          sections={sections}
          onClose={() => onSelectReq(null)}
        />
      ) : null}
    </div>
  )
}

function CitationPanel({
  p, req, sections, onClose,
}: {
  p: ProposalDetail
  req: Requirement
  sections: ProposalSection[]
  onClose: () => void
}) {
  const patch = useProposalPatch(p.id)

  const confirm = () =>
    patch.mutate(
      { id: p.id, requirement: { id: req.id, status: 'confirmed' } },
      {
        onSuccess: () => toast({
          title: 'Requirement verified against source passage',
          description: `${req.ref} confirmed in the compliance matrix.`,
        }),
      },
    )

  const reject = () =>
    patch.mutate(
      { id: p.id, requirement: { id: req.id, status: 'rejected' } },
      {
        onSuccess: () => toast({
          title: 'Requirement rejected',
          description: `${req.ref} excluded from coverage and the submission checklist.`,
        }),
      },
    )

  const remap = (sectionKey: string) => {
    const target = sections.find((s) => s.key === sectionKey)
    patch.mutate(
      { id: p.id, requirement: { id: req.id, sectionKey } },
      {
        onSuccess: () => toast({
          title: 'Requirement remapped',
          description: `${req.ref} now maps to ${target?.title ?? sectionKey}.`,
        }),
      },
    )
  }

  return (
    <aside className="w-full xl:w-96 shrink-0 rounded-lg border bg-card flex flex-col" aria-label="Requirement citation panel">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[12.5px] font-semibold truncate">{req.ref}</span>
          <StatusPill status={req.status} />
        </div>
        <button className="text-muted-foreground hover:text-foreground focus-ring rounded" onClick={onClose} aria-label="Close citation panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto scroll-thin">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Requirement</div>
          <p className="text-[13px] leading-5">{req.text}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Pill tone="muted">{REQ_KINDS[req.kind] ?? titleCase(req.kind)}</Pill>
          <Pill tone={req.obligation === 'shall' ? 'info' : 'muted'}>{titleCase(req.obligation)}</Pill>
        </div>

        <KV label="Owner">{req.owner}</KV>

        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Extraction confidence</div>
          <ScoreBar score={req.confidence} />
        </div>

        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Source passage</div>
          <div className="rounded-md border bg-muted/40 px-3 py-2.5">
            <div className="tnum text-[11px] font-medium text-muted-foreground mb-1.5">
              {req.sourceDoc}, page {req.page}, paragraph {req.paragraph}
            </div>
            <blockquote className="border-l-2 border-[var(--brand)] pl-2.5 text-[12.5px] italic leading-5 text-foreground/90">
              {req.sourceExcerpt}
            </blockquote>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--success)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified against source
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Maps to outline section</div>
          <Select value={req.sectionKey} onValueChange={remap}>
            <SelectTrigger size="sm" className="w-full h-8 text-[12px]" aria-label="Remap requirement to outline section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.key} value={s.key} className="text-[12px]">{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Remapping keeps the requirement visible in the writing workspace for that section.
          </p>
        </div>
      </div>

      <div className="px-4 py-3 border-t flex gap-2">
        <Button size="sm" className="h-8 text-[12px]" disabled={patch.isPending} onClick={confirm}>
          {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Confirm
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={patch.isPending} onClick={reject}>
          Reject
        </Button>
      </div>
    </aside>
  )
}

/* ------------------------------------------------- tab 3: outline & writing */

function WritingTab({
  p, sections, selectedSectionId, onSelectSection, onJumpToRequirement,
}: {
  p: ProposalDetail
  sections: ProposalSection[]
  selectedSectionId: string | null
  onSelectSection: (id: string) => void
  onJumpToRequirement: (reqId: string) => void
}) {
  const volumes = useMemo(() => {
    const seen: string[] = []
    for (const s of sections) if (!seen.includes(s.volume)) seen.push(s.volume)
    return [...VOLUME_ORDER.filter((v) => seen.includes(v)), ...seen.filter((v) => !VOLUME_ORDER.includes(v))]
  }, [sections])

  if (sections.length === 0) {
    return (
      <EmptyState
        title="No outline yet"
        hint="The outline is generated during solicitation intake — volumes, sections, page limits, and Section M evaluation factors."
        icon={<ListChecks className="h-7 w-7" strokeWidth={1.5} />}
      />
    )
  }

  const selected = sections.find((s) => s.id === selectedSectionId) ?? sections[0]

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start" data-tour="writing">
      {/* Outline tree */}
      <aside className="w-full lg:w-72 shrink-0 rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2.5 border-b flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold">Outline</h3>
          <Pill tone="muted">{sections.length} sections</Pill>
        </div>
        <div className="max-h-[70vh] overflow-y-auto scroll-thin pb-2">
          {volumes.map((vol) => (
            <div key={vol}>
              <div className="px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {vol} volume
              </div>
              {sections.filter((s) => s.volume === vol).map((s) => {
                const active = s.id === selected.id
                const targetWords = s.pageLimit && s.pageLimit > 0 ? s.pageLimit * WORDS_PER_PAGE : null
                return (
                  <button
                    key={s.id}
                    className={cn(
                      'w-full border-l-2 px-3 py-2 text-left transition-colors focus-ring',
                      active ? 'border-[var(--brand)] bg-accent/50' : 'border-transparent hover:bg-muted/50',
                    )}
                    onClick={() => onSelectSection(s.id)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', s.status === 'not_started' && 'opacity-50')}
                        style={{ background: SECTION_DOTS[s.status] ?? 'var(--muted-foreground)' }}
                        aria-hidden
                      />
                      <span className="truncate text-[12.5px] font-medium leading-4">{s.title}</span>
                      <span className="sr-only">{SECTION_STATUS[s.status] ?? titleCase(s.status)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground/80" title={s.assignee}>
                        {initials(s.assignee)}
                      </span>
                      <span className="tnum truncate">
                        {targetWords ? `${s.wordCount} / ~${targetWords.toLocaleString('en-US')} words` : `${s.wordCount} words`}
                      </span>
                      <span aria-hidden>·</span>
                      <DateText d={s.dueDate} />
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 min-w-0 w-full">
        <SectionEditor
          key={selected.id}
          proposalId={p.id}
          section={selected}
          requirements={p.requirements.filter((r) => r.sectionKey === selected.key)}
          onJumpToRequirement={onJumpToRequirement}
        />
      </div>
    </div>
  )
}

function SectionEditor({
  proposalId, section, requirements, onJumpToRequirement,
}: {
  proposalId: string
  section: ProposalSection
  requirements: Requirement[]
  onJumpToRequirement: (reqId: string) => void
}) {
  const go = useBidStore((s) => s.go)
  const patch = useProposalPatch(proposalId)
  const invalidate = useInvalidateProposal(proposalId)
  const [content, setContent] = useState(section.content)
  const [draftResult, setDraftResult] = useState<DraftResponse | null>(null)

  const words = wordCountOf(content)
  const dirty = content !== section.content

  const requestDraft = useMutation({
    mutationFn: async (): Promise<DraftResponse> => {
      const res = await fetch('/api/proposals/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, sectionId: section.id }),
      })
      if (!res.ok) throw new Error('Draft service unavailable')
      return res.json()
    },
    onSuccess: (r) => setDraftResult(r),
    onError: () => toast({
      title: 'Draft generation failed',
      description: 'The drafting service did not respond. Try again in a moment.',
      variant: 'destructive',
    }),
  })

  const acceptDraft = useMutation({
    mutationFn: async () => {
      if (draftResult?.status !== 'draft') throw new Error('No draft to accept')
      const put = await fetch('/api/proposals/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, accepted: true }),
      })
      if (!put.ok) throw new Error('Failed to record decision')
      const res = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId, section: { id: section.id, content: draftResult.draft } }),
      })
      if (!res.ok) throw new Error('Failed to save content')
      return draftResult.draft
    },
    onSuccess: (draftText) => {
      setContent(draftText)
      setDraftResult(null)
      invalidate()
      toast({
        title: 'Draft accepted into section — citations recorded',
        description: `${section.title} · ${wordCountOf(draftText)} words.`,
      })
    },
    onError: () => toast({ title: 'Could not accept draft', description: 'The decision was not recorded. Try again.', variant: 'destructive' }),
  })

  const rejectDraft = useMutation({
    mutationFn: async () => {
      const put = await fetch('/api/proposals/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, accepted: false }),
      })
      if (!put.ok) throw new Error('Failed to record decision')
    },
    onSuccess: () => {
      setDraftResult(null)
      toast({ title: 'Draft rejected', description: 'No changes were made to the section.' })
    },
    onError: () => toast({ title: 'Could not record rejection', variant: 'destructive' }),
  })

  const saveDraft = () =>
    patch.mutate(
      { id: proposalId, section: { id: section.id, content } },
      { onSuccess: () => toast({ title: 'Draft saved', description: `${section.title} · ${words} words.` }) },
    )

  const setStatus = (status: string) =>
    patch.mutate(
      { id: proposalId, section: { id: section.id, status } },
      {
        onSuccess: () => toast({
          title: 'Section status updated',
          description: `${section.title} — ${SECTION_STATUS[status] ?? titleCase(status)}.`,
        }),
      },
    )

  return (
    <div className="rounded-lg border bg-card">
      {/* Editor top bar */}
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold leading-5">{section.title}</h3>
            <StatusPill status={section.status} label={SECTION_STATUS[section.status] ?? titleCase(section.status)} />
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {section.volume} volume · {section.assignee} · due <DateText d={section.dueDate} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="tnum text-[12px] text-muted-foreground">
            {words} words · {section.pageLimit && section.pageLimit > 0 ? `limit ${section.pageLimit} pages` : 'no page limit'}
          </span>
          <Select value={section.status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="h-8 w-32 text-[12px]" aria-label="Section status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SECTION_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-[12px]">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {section.winTheme ? (
        <div className="px-4 py-2 border-b bg-muted/30 text-[12.5px] italic leading-5 text-muted-foreground">
          <span className="not-italic font-semibold text-foreground/70">Win theme.</span> {section.winTheme}
        </div>
      ) : null}
      {section.instructions ? (
        <div className="px-4 py-2 border-b text-[12px] leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground/70">Instructions.</span> {section.instructions}
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row">
        {/* Requirements addressed */}
        <div className="p-4 border-b md:border-b-0 md:border-r md:w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Requirements addressed
            </span>
            <Pill tone="muted">{requirements.length}</Pill>
          </div>
          {requirements.length === 0 ? (
            <p className="text-[12.5px] leading-5 text-muted-foreground">
              No requirements map to this section yet. Open the compliance matrix to remap requirements —
              verified rows are the ground truth for drafting.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
              {requirements.map((r) => (
                <button
                  key={r.id}
                  className="w-full rounded-md border bg-background/60 p-2 text-left transition-colors hover:border-[var(--brand)] focus-ring"
                  onClick={() => onJumpToRequirement(r.id)}
                  title="Open in the compliance matrix"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold">{r.ref}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted-foreground">{r.text}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Draft */}
        <div className="p-4 flex-1 min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Draft</span>
            <div className="flex items-center gap-2">
              {dirty ? (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--warning)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" /> Unsaved changes
                </span>
              ) : null}
              <Button
                variant="outline" size="sm" className="h-7 text-[12px]"
                disabled={!dirty || patch.isPending}
                onClick={saveDraft}
              >
                Save draft
              </Button>
              <Button
                size="sm" className="h-7 text-[12px] gap-1.5"
                data-tour="draft-button"
                disabled={requestDraft.isPending}
                onClick={() => requestDraft.mutate()}
              >
                {requestDraft.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />}
                {requestDraft.isPending ? 'Drafting…' : 'Draft from library'}
              </Button>
            </div>
          </div>

          {/* Draft suggestion / needs input */}
          {draftResult?.status === 'draft' ? (
            <div className="mb-3 rounded-lg border border-[var(--brand)]/40 bg-accent/25 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-[12.5px] leading-5 min-w-0">
                  <span className="font-semibold">Draft</span>
                  <span className="text-muted-foreground">
                    {' '}— Assistant proposal with {draftResult.sources.length} citations. Review before accepting.
                  </span>
                </div>
                <Pill tone="muted">
                  {draftResult.engine === 'assistant' ? 'Assistant-polished' : 'Assembled from sources'}
                </Pill>
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto scroll-thin whitespace-pre-wrap rounded-md border bg-card px-3 py-2.5 text-[12.5px] leading-5">
                <DraftCitations text={draftResult.draft} />
              </div>

              <Collapsible>
                <CollapsibleTrigger className="mt-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground focus-ring rounded">
                  <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
                  Sources ({draftResult.sources.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-56 overflow-y-auto scroll-thin space-y-2 pr-1">
                    {draftResult.sources.map((s, i) => (
                      <div key={`${s.id}-${i}`} className="rounded-md border bg-card p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={SOURCE_TONES[s.type]}>{SOURCE_LABELS[s.type]}</Pill>
                          <span className="font-mono text-[11px] font-semibold">{s.ref}</span>
                          <span className="truncate text-[12px] font-medium">{s.title}</span>
                        </div>
                        <blockquote className="mt-1.5 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-muted-foreground">
                          {s.excerpt}
                        </blockquote>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="mt-2.5 flex items-center gap-2">
                <Button size="sm" className="h-7 text-[12px]" disabled={acceptDraft.isPending} onClick={() => acceptDraft.mutate()}>
                  {acceptDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Accept draft
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={rejectDraft.isPending} onClick={() => rejectDraft.mutate()}>
                  Reject
                </Button>
              </div>
            </div>
          ) : null}

          {draftResult?.status === 'needs_input' ? (
            <div className="mb-3 rounded-lg border border-[var(--warning)]/50 p-3" style={{ background: 'var(--warning-bg)' }}>
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--warning)]">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Needs input — the Assistant will not draft without grounded support.
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-5">
                {draftResult.missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Approve library content in the Library section, then draft again.
              </p>
              <Button variant="outline" size="sm" className="mt-2 h-7 text-[12px] gap-1.5" onClick={() => go('library')}>
                <BookOpen className="h-3.5 w-3.5" /> Open Library
              </Button>
            </div>
          ) : null}

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Draft the section response. Ground every claim in a verified requirement or approved library content."
            className="min-h-64 text-[13px] leading-relaxed"
            aria-label={`Draft text for ${section.title}`}
          />
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- tab 4: reviews */

function ReviewsTab({ p, sections }: { p: ProposalDetail; sections: ProposalSection[] }) {
  const sectionTitles = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of sections) m[s.key] = s.title
    return m
  }, [sections])

  if (p.reviewCycles.length === 0) {
    return (
      <EmptyState
        title="No reviews scheduled"
        hint="Color team reviews (Blue, Pink, Red, Gold) are scheduled as the proposal approaches submission. Findings and dispositions appear here."
        icon={<ClipboardList className="h-7 w-7" strokeWidth={1.5} />}
      />
    )
  }

  return (
    <div className="space-y-4">
      {p.reviewCycles.map((rc) => (
        <ReviewCard key={rc.id} proposalId={p.id} rc={rc} sectionTitles={sectionTitles} />
      ))}
    </div>
  )
}

function ReviewCard({
  proposalId, rc, sectionTitles,
}: {
  proposalId: string
  rc: ReviewCycle
  sectionTitles: Record<string, string>
}) {
  const patch = useProposalPatch(proposalId)
  const meta = REVIEW_KINDS[rc.kind] ?? { label: `${titleCase(rc.kind)} Team`, dot: 'var(--muted-foreground)' }
  const total = rc.findings.length
  const open = rc.findings.filter((f) => f.disposition === 'open').length
  const blockers = rc.findings.filter((f) => f.severity === 'blocker').length
  const notes = typeof rc.summary?.notes === 'string' ? rc.summary.notes : ''
  const avg = typeof rc.summary?.avgScore === 'number' ? rc.summary.avgScore : null

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: meta.dot }} aria-hidden />
          <h3 className="text-[13px] font-semibold">{meta.label}</h3>
        </div>
        <span className="text-[12px] text-muted-foreground">
          Scheduled <DateText d={rc.scheduledAt} />
        </span>
        <StatusPill status={rc.status} />
        <div className="ml-auto flex items-center gap-2">
          {rc.status === 'scheduled' ? (
            <Button
              size="sm" className="h-7 text-[12px]"
              disabled={patch.isPending}
              onClick={() =>
                patch.mutate(
                  { id: proposalId, review: { id: rc.id, action: 'start' } },
                  { onSuccess: () => toast({ title: `${meta.label} review started`, description: 'Record findings as you review the draft volumes.' }) },
                )
              }
            >
              Start review
            </Button>
          ) : null}
          {rc.status === 'in_progress' ? (
            <Button
              size="sm" className="h-7 text-[12px]"
              disabled={patch.isPending}
              onClick={() =>
                patch.mutate(
                  { id: proposalId, review: { id: rc.id, action: 'complete' } },
                  { onSuccess: () => toast({ title: `${meta.label} review complete`, description: 'Summary generated from the recorded findings.' }) },
                )
              }
            >
              Complete review
            </Button>
          ) : null}
        </div>
      </div>

      {rc.status === 'complete' ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b bg-muted/30 px-4 py-2.5">
          <span className="tnum text-[12px]"><span className="font-semibold">{total}</span> <span className="text-muted-foreground">findings</span></span>
          <span className="tnum text-[12px]"><span className="font-semibold">{open}</span> <span className="text-muted-foreground">open</span></span>
          <span className="tnum text-[12px]"><span className="font-semibold">{blockers}</span> <span className="text-muted-foreground">blockers</span></span>
          {avg !== null ? (
            <span className="tnum text-[12px]"><span className="font-semibold">{avg.toFixed(1)}</span> <span className="text-muted-foreground">avg score</span></span>
          ) : null}
          {notes ? (
            <span className="min-w-0 flex-1 truncate text-[12px] italic text-muted-foreground" title={notes}>{notes}</span>
          ) : null}
        </div>
      ) : null}

      {rc.status !== 'scheduled' ? (
        total ? (
          <FindingsTable proposalId={proposalId} rc={rc} sectionTitles={sectionTitles} />
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-muted-foreground">
            No findings recorded for this review yet.
          </div>
        )
      ) : null}
    </div>
  )
}

function FindingsTable({
  proposalId, rc, sectionTitles,
}: {
  proposalId: string
  rc: ReviewCycle
  sectionTitles: Record<string, string>
}) {
  const columns: Column<ReviewFinding>[] = [
    {
      key: 'severity', header: 'Severity', className: 'w-24',
      sortValue: (f) => f.severity,
      render: (f) => <Pill tone={SEVERITY_TONES[f.severity] ?? 'muted'}>{titleCase(f.severity)}</Pill>,
    },
    {
      key: 'comment', header: 'Finding', className: 'min-w-48',
      sortValue: (f) => f.comment,
      render: (f) => <span className="line-clamp-2 max-w-md text-[12.5px] leading-4" title={f.comment}>{f.comment}</span>,
    },
    {
      key: 'section', header: 'Section', className: 'w-56',
      sortValue: (f) => sectionTitles[f.sectionKey] ?? f.sectionKey,
      render: (f) => <span className="text-[12.5px] text-muted-foreground">{sectionTitles[f.sectionKey] ?? f.sectionKey}</span>,
    },
    {
      key: 'disposition', header: 'Disposition', className: 'w-28',
      sortValue: (f) => f.disposition,
      render: (f) => <StatusPill status={f.disposition} />,
    },
    {
      key: 'response', header: 'Response', className: 'w-72 align-top',
      sortValue: (f) => f.response,
      render: (f) => <FindingActions proposalId={proposalId} finding={f} />,
    },
  ]

  return <DataTable columns={columns} rows={rc.findings} dense csvName={`review-${rc.kind}-findings`} />
}

function FindingActions({ proposalId, finding }: { proposalId: string; finding: ReviewFinding }) {
  const patch = useProposalPatch(proposalId)
  const [response, setResponse] = useState('')

  if (finding.disposition !== 'open') {
    return finding.response ? (
      <p className="line-clamp-2 text-[12px] italic leading-4 text-muted-foreground" title={finding.response}>
        “{finding.response}”
      </p>
    ) : (
      <span className="text-[12px] text-muted-foreground">—</span>
    )
  }

  const disposition = (d: 'accepted' | 'rejected' | 'deferred') => {
    const resp = d === 'accepted' && !response.trim() ? 'Addressed in revision.' : response
    patch.mutate(
      { id: proposalId, finding: { id: finding.id, disposition: d, response: resp } },
      {
        onSuccess: () => toast({
          title: `Finding ${d}`,
          description: resp ? `Response recorded: ${resp}` : `${titleCase(finding.severity)} finding on ${finding.sectionKey}.`,
        }),
      },
    )
  }

  return (
    <div className="w-56 space-y-1.5">
      <Textarea
        rows={2}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Response (optional)…"
        className="min-h-0 h-14 resize-none px-2 py-1.5 text-[12px]"
        aria-label="Finding response"
      />
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-6 px-2 text-[11px]" disabled={patch.isPending} onClick={() => disposition('accepted')}>Accept</Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={patch.isPending} onClick={() => disposition('rejected')}>Reject</Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={patch.isPending} onClick={() => disposition('deferred')}>Defer</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ tab 5: submission */

type ReadinessCheck = {
  label: string
  state: 'pass' | 'warn' | 'fail'
  detail: string
  sample?: boolean
  navigate?: string
}

function SubmissionTab({ p, onNavigate }: { p: ProposalDetail; onNavigate: (tab: string) => void }) {
  const session = useSession()
  const patch = useProposalPatch(p.id)
  const [exportOpen, setExportOpen] = useState(false)
  const [format, setFormat] = useState<'docx' | 'pdf'>('docx')
  const [includeMatrix, setIncludeMatrix] = useState(true)

  const sections = useMemo(() => [...p.sections].sort((a, b) => a.order - b.order), [p.sections])
  const allFindings = p.reviewCycles.flatMap((rc) => rc.findings)

  const checks = useMemo<ReadinessCheck[]>(() => {
    const extracted = p.requirements.filter((r) => r.status === 'extracted').length
    const openFindings = allFindings.filter((f) => f.disposition === 'open').length
    const notFinal = sections.filter((s) => s.status !== 'final').length
    return [
      {
        label: 'All requirements confirmed or rejected',
        state: extracted > 0 ? 'fail' : 'pass',
        detail: extracted > 0
          ? `${extracted} requirement${extracted === 1 ? '' : 's'} still awaiting verification against the source passage.`
          : 'Every extracted requirement has a verified disposition.',
        navigate: 'matrix',
      },
      {
        label: 'No open review findings',
        state: openFindings > 0 ? 'fail' : 'pass',
        detail: openFindings > 0
          ? `${openFindings} finding${openFindings === 1 ? '' : 's'} open across color team reviews.`
          : 'All review findings are dispositioned.',
        navigate: 'reviews',
      },
      {
        label: 'All sections final or N/A',
        state: notFinal > 0 ? 'warn' : 'pass',
        detail: notFinal > 0
          ? `${notFinal} of ${sections.length} sections not final.`
          : 'All outline sections are final.',
        navigate: 'outline',
      },
      {
        label: 'Price volume prepared',
        state: p.contractType ? 'pass' : 'warn',
        detail: p.contractType
          ? `Contract type ${p.contractType} — CLIN structure maintained in Pricing.`
          : 'No contract type recorded for this proposal.',
      },
      {
        label: 'Representations current in SAM',
        state: 'pass',
        detail: 'Sample data — registrations and representations verified current in SAM.',
        sample: true,
      },
    ]
  }, [p.requirements, allFindings, sections, p.contractType])

  const blockers = checks.filter((c) => c.state === 'fail').length
  const warnings = checks.filter((c) => c.state === 'warn').length
  const orgName = session.data?.org?.name ?? 'Sample organization'

  const buildExportText = () => {
    const L: string[] = []
    L.push('BIDDESK — PROPOSAL EXPORT PREVIEW (sample artifact)')
    L.push(`Selected format: ${format.toUpperCase()} · generated ${fmtDateTime(new Date().toISOString())}`)
    L.push('This plain-text file is a preview of the assembled document export.')
    L.push('')
    L.push('='.repeat(72))
    L.push(orgName)
    L.push(p.title)
    L.push(`Solicitation ${p.solicitationNumber} · ${p.agency}`)
    L.push(`Due ${fmtDateTime(p.dueAt)} · Contract type ${p.contractType || '—'} · Status ${titleCase(p.status)}`)
    L.push('='.repeat(72))
    const volumes: string[] = []
    for (const s of sections) if (!volumes.includes(s.volume)) volumes.push(s.volume)
    for (const vol of volumes) {
      L.push('')
      L.push(`${vol.toUpperCase()} VOLUME`)
      L.push('-'.repeat(72))
      for (const s of sections.filter((x) => x.volume === vol)) {
        L.push('')
        L.push(`${s.title}  [${SECTION_STATUS[s.status] ?? s.status}]`)
        L.push(s.content.trim() ? s.content.trim() : '(not drafted)')
      }
    }
    if (includeMatrix && p.requirements.length > 0) {
      L.push('')
      L.push('='.repeat(72))
      L.push('APPENDIX — COMPLIANCE MATRIX')
      L.push('='.repeat(72))
      for (const r of p.requirements) {
        L.push('')
        L.push(`${r.ref}  [${r.status.toUpperCase()}]  ${r.sourceDoc} p.${r.page} ¶${r.paragraph}`)
        L.push(`  ${r.text}`)
        L.push(`  Source: "${r.sourceExcerpt}"`)
      }
    }
    return L.join('\n')
  }

  const download = () => {
    const blob = new Blob([buildExportText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.solicitationNumber}_proposal_preview.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
    toast({
      title: 'Export downloaded',
      description: `${p.solicitationNumber}_proposal_preview.txt — plain-text preview artifact (${format.toUpperCase()} selected).`,
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* Readiness checklist */}
      <div className="rounded-lg border bg-card lg:col-span-2 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" /> Submission readiness
          </h3>
          <Pill tone="muted">Computed live</Pill>
        </div>
        <div className="divide-y">
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3 px-4 py-3">
              {c.state === 'pass' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
              ) : c.state === 'warn' ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium leading-4">{c.label}</span>
                  {c.sample ? <SampleTag /> : null}
                </div>
                <div className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{c.detail}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.state !== 'pass' && c.navigate ? (
                  <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-0.5" onClick={() => onNavigate(c.navigate!)}>
                    Review <ChevronRight className="h-3 w-3" />
                  </Button>
                ) : null}
                <Pill tone={c.state === 'pass' ? 'success' : c.state === 'warn' ? 'warning' : 'danger'}>
                  {c.state === 'pass' ? 'Pass' : c.state === 'warn' ? 'Warning' : 'Blocker'}
                </Pill>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
        <div>
          <div
            className={cn(
              'text-[13px] font-semibold leading-5',
              blockers > 0 ? 'text-[var(--danger)]' : warnings > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]',
            )}
          >
            {blockers > 0
              ? `${blockers} blocker${blockers === 1 ? '' : 's'} must be resolved before submission readiness`
              : warnings > 0
                ? `No blockers — ${warnings} warning${warnings === 1 ? '' : 's'} outstanding`
                : 'All readiness checks pass'}
          </div>
          <p className="mt-1.5 text-[12px] leading-4 text-muted-foreground">
            Readiness is computed live from the compliance matrix, review findings, and outline status.
          </p>
        </div>

        <Button variant="outline" size="sm" className="h-8 w-full text-[12px] gap-1.5" onClick={() => setExportOpen(true)}>
          <Download className="h-3.5 w-3.5" /> Export proposal
        </Button>

        {p.status === 'submitted' || p.status === 'won' || p.status === 'lost' ? (
          <div className="flex items-center justify-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            Recorded as {PROPOSAL_STATUS[p.status] ?? titleCase(p.status).toLowerCase()}.
          </div>
        ) : (
          <Button
            size="sm" className="h-8 w-full text-[12px]"
            disabled={blockers > 0 || patch.isPending}
            title={blockers > 0 ? 'Resolve all blockers before marking submitted' : undefined}
            onClick={() =>
              patch.mutate(
                { id: p.id, status: 'submitted' },
                {
                  onSuccess: () => toast({
                    title: 'Proposal marked submitted',
                    description: `${p.title} — ${p.solicitationNumber}.`,
                  }),
                },
              )
            }
          >
            {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Mark submitted
          </Button>
        )}
      </div>

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export preview</DialogTitle>
            <DialogDescription>
              A preview of the assembled proposal. The download is a plain-text outline with drafted content,
              clearly labeled as a preview artifact.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Mini document preview */}
            <div className="rounded-md border bg-white px-5 py-6 text-center text-[#1A2332] shadow-sm" aria-label="Document preview">
              <div className="text-[8px] font-semibold uppercase tracking-[0.25em] text-[#5B6779]">BidDesk</div>
              <div className="mt-10 text-[12px] font-semibold leading-4">{p.title}</div>
              <div className="tnum mt-2 text-[9px] text-[#5B6779]">Solicitation {p.solicitationNumber}</div>
              <div className="mt-1 text-[9px] text-[#5B6779]">{orgName}</div>
              <div className="mt-12 text-[7px] uppercase tracking-wide text-[#98A2B3]">Sample — preview artifact</div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-[12px] font-medium">Format</Label>
                <RadioGroup value={format} onValueChange={(v) => setFormat(v === 'pdf' ? 'pdf' : 'docx')} className="mt-2 gap-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="docx" id="fmt-docx" />
                    <Label htmlFor="fmt-docx" className="cursor-pointer text-[13px] font-normal">DOCX (Word)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="pdf" id="fmt-pdf" />
                    <Label htmlFor="fmt-pdf" className="cursor-pointer text-[13px] font-normal">PDF</Label>
                  </div>
                </RadioGroup>
              </div>

              <label htmlFor="inc-matrix" className="flex cursor-pointer items-start gap-2">
                <Checkbox id="inc-matrix" checked={includeMatrix} onCheckedChange={(v) => setIncludeMatrix(v === true)} className="mt-0.5" />
                <span className="text-[13px] leading-5">Include compliance matrix as appendix</span>
              </label>

              <p className="tnum text-[11.5px] leading-4 text-muted-foreground">
                Preview artifact — the file downloads as {p.solicitationNumber}_proposal_preview.txt
                ({p.requirements.length} requirements, {sections.length} sections).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[12px] gap-1.5" onClick={download}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
