'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useBidStore } from '@/lib/biddesk/store'
import {
  SectionHeader, StatCard, Pill, StatusPill, EmptyState, FadeIn, DataTable, KV, Money, DateText,
  ScoreBar, type Column, type PillTone,
} from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { fmtMoneyCompact, STAGE_LABELS, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  KanbanSquare, Table2, MoreHorizontal, ChevronRight, Trophy, ArrowRight, ArrowLeft,
  Loader2, Users, TriangleAlert, Ban, CheckCircle2,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type PwinFactor = { id: string; key: string; label: string; score: number; weight: number; detail: string }
type GateScoreRow = { key: string; label: string; score: number; weight: number; comment: string }
type GateCriterion = { key: string; label: string; weight: number }
type Teaming = {
  id: string; partnerId: string; partnerName: string; role: string;
  worksharePct: number; ndaStatus: string; taStatus: string
}
type PartnerLite = { id: string; name: string; certifications: string; performanceRating: number; capabilities: string }

type Pursuit = {
  id: string; title: string; agency: string; stage: string; captureLead: string;
  expectedValueCents: number; totalValueCents: number; pwin: number; weightedValueCents: number;
  gateStatus: string; gateDecision: string; gateScore: GateScoreRow[];
  gateApprovedBy: string; gateApprovedAt: string | null;
  decisionDate: string | null; winThemes: string[]; noBidReason: string; competitorNote: string;
  opportunityId: string | null;
  opportunity: { id: string; title: string; solicitationNumber: string; responseDeadline: string | null; noticeType: string } | null;
  pwinFactors: PwinFactor[]; teaming: Teaming[]
}

type PursuitsData = {
  pursuits: Pursuit[]
  partners: PartnerLite[]
  stageOrder: string[]
  pwinWeights: { key: string; label: string; weight: number }[]
  gateCriteria: GateCriterion[]
}

/** The six active kanban stages (won/lost are terminal and not shown on the board). */
const ACTIVE_STAGES: string[] = ['identified', 'qualifying', 'capture', 'bid_decision', 'proposal', 'submitted']

const AGREE_TONE: Record<string, PillTone> = { executed: 'success', negotiating: 'warning', none: 'muted' }

const TEAM_ROLES = ['Prime', 'Subcontractor', 'JV']

/* ------------------------------ board pieces ------------------------------ */

function BoardCard({ pursuit, onOpen, onMove }: {
  pursuit: Pursuit
  onOpen: (id: string) => void
  onMove: (id: string, stage: string, from: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pursuit.id })
  const idx = ACTIVE_STAGES.indexOf(pursuit.stage)
  const prevStage = idx > 0 ? ACTIVE_STAGES[idx - 1] : null
  const nextStage = idx >= 0 && idx < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[idx + 1] : null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`${pursuit.title} — drag to change stage`}
      className={cn(
        'cursor-grab rounded-md border bg-card p-2.5 transition-colors hover:border-[var(--brand)] active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="line-clamp-2 text-[12.5px] font-medium leading-4">{pursuit.title}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{pursuit.agency}</div>
      <div className="mt-2">
        <ScoreBar score={pursuit.pwin} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="tnum text-[11px] text-muted-foreground">{fmtMoneyCompact(pursuit.weightedValueCents)} weighted</span>
        {pursuit.gateStatus !== 'pending' ? (
          <StatusPill status={pursuit.gateStatus} label={pursuit.gateStatus === 'approved' ? 'Gate: Bid' : 'Gate: No-Bid'} />
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-end gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          aria-label={`Open ${pursuit.title}`}
          onClick={() => onOpen(pursuit.id)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Move stage menu">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-[12px]">
            <DropdownMenuItem disabled={!prevStage} onClick={() => prevStage && onMove(pursuit.id, prevStage, pursuit.stage)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Move to previous stage
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!nextStage} onClick={() => nextStage && onMove(pursuit.id, nextStage, pursuit.stage)}>
              <ArrowRight className="h-3.5 w-3.5" /> Move to next stage
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function BoardColumn({ stage, pursuits, onOpen, onMove }: {
  stage: string
  pursuits: Pursuit[]
  onOpen: (id: string) => void
  onMove: (id: string, stage: string, from: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = pursuits.reduce((s, p) => s + p.totalValueCents, 0)
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors',
        isOver && 'border-[var(--brand)] ring-1 ring-[var(--brand)]',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-2.5 py-2">
        <span className="text-[12px] font-semibold leading-4">{STAGE_LABELS[stage] ?? titleCase(stage)}</span>
        <span className="tnum text-[11px] text-muted-foreground">{pursuits.length} · {fmtMoneyCompact(total)}</span>
      </div>
      <div className="flex min-h-20 flex-col gap-2 p-2">
        {pursuits.length === 0 ? (
          <div className="rounded-md border border-dashed py-4 text-center text-[11px] text-muted-foreground">
            Drop pursuits here
          </div>
        ) : pursuits.map((p) => (
          <BoardCard key={p.id} pursuit={p} onOpen={onOpen} onMove={onMove} />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ detail tabs ------------------------------- */

function OverviewTab({ pursuit }: { pursuit: Pursuit }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(pursuit.competitorNote)
  const [themes, setThemes] = useState(pursuit.winThemes.join('\n'))

  const saveNote = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pursuit.id, competitorNote: note }),
      })
      if (!res.ok) throw new Error('failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({ title: 'Competitor note saved' })
    },
    onError: () => toast({ title: 'Could not save note', variant: 'destructive' }),
  })

  const saveThemes = useMutation({
    mutationFn: async (list: string[]) => {
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pursuit.id, winThemes: list }),
      })
      if (!res.ok) throw new Error('failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({ title: 'Win themes saved' })
    },
    onError: () => toast({ title: 'Could not save win themes', variant: 'destructive' }),
  })

  const themeList = themes.split('\n').map((t) => t.trim()).filter(Boolean)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Pursuit record</h3>
        <dl>
          <KV label="Agency">{pursuit.agency}</KV>
          <KV label="Stage">{STAGE_LABELS[pursuit.stage] ?? titleCase(pursuit.stage)}</KV>
          <KV label="Capture lead">{pursuit.captureLead || '—'}</KV>
          <KV label="Total value"><Money cents={pursuit.totalValueCents} /></KV>
          <KV label="Expected value"><Money cents={pursuit.expectedValueCents} /></KV>
          <KV label="Weighted value">
            <span>
              <Money cents={pursuit.weightedValueCents} />
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">(total × {pursuit.pwin}% PWin)</span>
            </span>
          </KV>
          <KV label="Decision date"><DateText d={pursuit.decisionDate} /></KV>
          {pursuit.opportunity ? (
            <KV label="Source opportunity">
              <span className="inline-block max-w-56 truncate" title={pursuit.opportunity.title}>
                {pursuit.opportunity.title}
              </span>
            </KV>
          ) : null}
        </dl>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Competitor note</h3>
            <Button
              size="sm" variant="outline" className="h-7 text-[12px]"
              disabled={note === pursuit.competitorNote || saveNote.isPending}
              onClick={() => saveNote.mutate()}
            >
              {saveNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
          <Textarea
            rows={4} className="text-[13px]"
            placeholder="Incumbent, likely competitors, pricing signals, customer intelligence…"
            value={note} onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex-1 rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Win themes</h3>
            <Button
              size="sm" variant="outline" className="h-7 text-[12px]"
              disabled={themeList.join('\n') === pursuit.winThemes.join('\n') || saveThemes.isPending}
              onClick={() => saveThemes.mutate(themeList)}
            >
              {saveThemes.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
          <Textarea
            rows={4} className="text-[13px]"
            placeholder={'One win theme per line — e.g., "Only proposer with an ERDC-approved data platform"'}
            value={themes} onChange={(e) => setThemes(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            One theme per line. Win themes feed proposal outlines and reviews.
          </p>
        </div>
      </div>
    </div>
  )
}

function PwinTab({ pursuit }: { pursuit: Pursuit }) {
  const qc = useQueryClient()
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(pursuit.pwinFactors.map((f) => [f.key, f.score])))

  const save = useMutation({
    mutationFn: async ({ key, score }: { key: string; score: number }) => {
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pursuit.id, pwinFactors: [{ key, score }] }),
      })
      if (!res.ok) throw new Error('failed')
      return (await res.json()) as { ok: boolean; pwin: number }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({ title: `PWin recalculated — ${d.pwin}%`, description: 'Weighted value updated across the pipeline.' })
    },
    onError: () => toast({ title: 'Could not save PWin factor', variant: 'destructive' }),
  })

  const factors = pursuit.pwinFactors
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 100
  const computed = Math.round(factors.reduce((s, f) => s + (scores[f.key] ?? f.score) * f.weight, 0) / totalWeight)

  return (
    <div>
      <div className="mb-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weighted PWin</div>
            <div className="tnum text-3xl font-semibold leading-9">{computed}%</div>
          </div>
          <div className="text-right">
            <ScoreBar score={computed} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Recalculates automatically when a slider is committed.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {factors.map((f) => (
          <div key={f.key} className="rounded-lg border bg-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium">{f.label}</span>
              <span className="tnum text-[13px] font-semibold">{scores[f.key] ?? f.score}%</span>
            </div>
            <Slider
              className="mt-2.5"
              min={0} max={100} step={5}
              value={[scores[f.key] ?? f.score]}
              onValueChange={(v) => setScores((s) => ({ ...s, [f.key]: v[0] ?? f.score }))}
              onValueCommit={(v) => save.mutate({ key: f.key, score: v[0] ?? f.score })}
              aria-label={`${f.label} score`}
            />
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <p className="text-[12px] leading-4 text-muted-foreground">{f.detail}</p>
              <span className="tnum shrink-0 text-[11px] text-muted-foreground">Weight {f.weight}%</span>
            </div>
          </div>
        ))}
        {factors.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No PWin factors recorded for this pursuit.</p>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Weights are configurable by Admins in Settings.</p>
    </div>
  )
}

function GateTab({ pursuit, gateCriteria }: { pursuit: Pursuit; gateCriteria: GateCriterion[] }) {
  const qc = useQueryClient()
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(gateCriteria.map((c) => [c.key, 3])))
  const [comments, setComments] = useState<Record<string, string>>({})
  const [noBidOpen, setNoBidOpen] = useState(false)
  const [noBidReason, setNoBidReason] = useState('')

  const decide = useMutation({
    mutationFn: async (vars: { decision: 'Bid' | 'No-Bid'; noBidReason?: string }) => {
      const payloadScores = gateCriteria.map((c) => ({
        key: c.key, label: c.label, score: scores[c.key] ?? 3, weight: c.weight, comment: comments[c.key] ?? '',
      }))
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pursuit.id, gate: { scores: payloadScores, decision: vars.decision, noBidReason: vars.noBidReason } }),
      })
      if (!res.ok) throw new Error('failed')
      return (await res.json()) as { ok: boolean; stage: string; avgScore: number }
    },
    onSuccess: (d, vars) => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast(vars.decision === 'Bid'
        ? {
            title: 'Bid decision approved',
            description: `Weighted gate score ${d.avgScore.toFixed(1)}/5.0 — pursuit moved to the Proposal stage.`,
          }
        : {
            title: 'No-Bid recorded',
            description: 'Pursuit moved to Lost / No-Bid. The reason feeds win/loss reporting.',
          })
    },
    onError: () => toast({ title: 'Could not record the gate decision', variant: 'destructive' }),
  })

  /* ----- decided: read-only scorecard ----- */
  if (pursuit.gateStatus !== 'pending') {
    const rows = pursuit.gateScore
    const tw = rows.reduce((s, r) => s + r.weight, 0) || 100
    const avg = rows.length ? rows.reduce((s, r) => s + r.score * r.weight, 0) / tw : 0
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weighted gate score</div>
            <div className="tnum text-2xl font-semibold leading-7">
              {avg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground"> / 5.0</span>
            </div>
          </div>
          <StatusPill
            status={pursuit.gateStatus}
            label={pursuit.gateStatus === 'approved' ? 'Bid decision' : 'No-Bid decision'}
          />
          <div className="ml-auto text-right text-[12px] text-muted-foreground">
            <div>Recorded by {pursuit.gateApprovedBy || '—'}</div>
            {pursuit.gateApprovedAt ? <div><DateText d={pursuit.gateApprovedAt} /></div> : null}
          </div>
        </div>
        {pursuit.gateStatus === 'rejected' && pursuit.noBidReason ? (
          <div className="flex gap-2 rounded-md border border-[var(--warning)] bg-[var(--warning-bg)] p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <div>
              <div className="text-[12.5px] font-medium">No-bid reason</div>
              <p className="text-[12.5px] text-muted-foreground">{pursuit.noBidReason}</p>
            </div>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No scorecard rows were recorded with this decision.</p>
        ) : rows.map((r) => (
          <div key={r.key} className="rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{r.label}</span>
              <div className="flex items-center gap-2">
                <Pill tone={r.score >= 4 ? 'success' : r.score >= 3 ? 'muted' : 'danger'}>{r.score}/5</Pill>
                <span className="tnum text-[11px] text-muted-foreground">Weight {r.weight}%</span>
              </div>
            </div>
            {r.comment ? <p className="mt-1 text-[12px] text-muted-foreground">{r.comment}</p> : null}
          </div>
        ))}
      </div>
    )
  }

  /* ----- pending: scorecard + decision ----- */
  const totalW = gateCriteria.reduce((s, c) => s + c.weight, 0) || 100
  const liveAvg = gateCriteria.reduce((s, c) => s + (scores[c.key] ?? 3) * c.weight, 0) / totalW

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live weighted score</div>
          <div className="tnum text-2xl font-semibold leading-7">
            {liveAvg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground"> / 5.0</span>
          </div>
        </div>
        <p className="max-w-sm text-[11.5px] text-muted-foreground">
          Score each criterion 1–5. The weighted average uses the criteria weights configured by Admins in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {gateCriteria.map((c) => (
          <div key={c.key} className="rounded-lg border bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{c.label}</span>
              <span className="tnum text-[11px] text-muted-foreground">Weight {c.weight}%</span>
            </div>
            <div className="mt-2 flex gap-1" role="radiogroup" aria-label={`Score for ${c.label}`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={(scores[c.key] ?? 3) === n}
                  aria-label={`${c.label}: ${n} of 5`}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className={cn(
                    'focus-ring tnum h-7 w-8 rounded-md border text-xs font-medium transition-colors',
                    (scores[c.key] ?? 3) === n
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <Textarea
              className="mt-2 min-h-14 text-[12.5px]"
              rows={2}
              placeholder="Comment (optional)"
              value={comments[c.key] ?? ''}
              onChange={(e) => setComments((s) => ({ ...s, [c.key]: e.target.value }))}
              aria-label={`Comment for ${c.label}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="text-[13px] font-semibold">Bid decision</div>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          A Bid decision moves the pursuit to the Proposal stage. A No-Bid requires a reason and archives the pursuit to Lost / No-Bid.
        </p>
        {noBidOpen ? (
          <div className="mt-3 space-y-2">
            <Label htmlFor="nobid-reason" className="text-[12px]">Reason for No-Bid *</Label>
            <Textarea
              id="nobid-reason" rows={2} className="text-[13px]"
              placeholder="e.g., Incumbent holds the requirement on a locked-in vehicle."
              value={noBidReason} onChange={(e) => setNoBidReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => setNoBidOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive" size="sm" className="h-8 gap-1.5 text-[12px]"
                disabled={!noBidReason.trim() || decide.isPending}
                onClick={() => decide.mutate({ decision: 'No-Bid', noBidReason: noBidReason.trim() })}
              >
                {decide.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Confirm No-Bid
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm"
              className="h-8 gap-1.5 border-[var(--danger)]/50 text-[12px] text-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
              onClick={() => setNoBidOpen(true)}
            >
              <Ban className="h-3.5 w-3.5" /> Record No-Bid
            </Button>
            <Button
              size="sm" className="h-8 gap-1.5 text-[12px]"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ decision: 'Bid' })}
            >
              {decide.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Approve Bid decision
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamingTab({ pursuit, partners }: { pursuit: Pursuit; partners: PartnerLite[] }) {
  const qc = useQueryClient()
  const available = partners.filter((p) => !pursuit.teaming.some((t) => t.partnerId === p.id))
  const [partnerId, setPartnerId] = useState('')
  const [role, setRole] = useState('Subcontractor')
  const [workshare, setWorkshare] = useState('20')

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pursuit.id, teaming: { partnerId, role, worksharePct: Number(workshare) || 0 } }),
      })
      if (!res.ok) throw new Error('failed')
      return (await res.json()) as { teaming: { partnerName: string; role: string; worksharePct: number } }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({
        title: 'Teaming partner added',
        description: `${d.teaming.partnerName} — ${d.teaming.role}, ${d.teaming.worksharePct}% workshare.`,
      })
      setPartnerId('')
      setRole('Subcontractor')
      setWorkshare('20')
    },
    onError: () => toast({ title: 'Could not add teaming partner', variant: 'destructive' }),
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Current teaming</h3>
        {pursuit.teaming.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            No teaming partners on this pursuit yet.
          </div>
        ) : (
          <div className="space-y-2">
            {pursuit.teaming.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{t.partnerName}</div>
                  <div className="text-[11px] text-muted-foreground">{t.role}</div>
                </div>
                <span className="tnum text-[13px] font-medium">{t.worksharePct}%</span>
                <Pill tone={AGREE_TONE[t.ndaStatus] ?? 'muted'}>NDA {titleCase(t.ndaStatus)}</Pill>
                <Pill tone={AGREE_TONE[t.taStatus] ?? 'muted'}>TA {titleCase(t.taStatus)}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-[13px] font-semibold">Add partner</h3>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_9.5rem_6.5rem_auto]">
          <div className="grid gap-1.5">
            <Label className="text-[12px]">Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger className="h-8 w-full text-[13px]" aria-label="Partner" disabled={available.length === 0}>
                <SelectValue placeholder={available.length === 0 ? 'All partners assigned' : 'Choose partner'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12px]">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 w-full text-[13px]" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="workshare-input" className="text-[12px]">Workshare %</Label>
            <Input
              id="workshare-input" type="number" min={0} max={100}
              className="h-8 w-full text-[13px]"
              value={workshare} onChange={(e) => setWorkshare(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" disabled={!partnerId || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            Add partner
          </Button>
        </div>
        {partners.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            No partners in the directory yet — add partners in the Partners section.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------ main section ------------------------------- */

export function PipelineSection() {
  const go = useBidStore((s) => s.go)
  const setParam = useBidStore((s) => s.setParam)
  const paramId = useBidStore((s) => s.params.pipeline?.id)
  const qc = useQueryClient()

  const [view, setView] = useState<'board' | 'table'>('board')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [wonContractId, setWonContractId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<PursuitsData>({
    queryKey: ['pursuits'],
    queryFn: async (): Promise<PursuitsData> => {
      const res = await fetch('/api/pursuits')
      if (!res.ok) throw new Error('Failed to load pursuits')
      return (await res.json()) as PursuitsData
    },
  })



  const stageMutation = useMutation({
    mutationFn: async (vars: { id: string; stage: string; from: string }) => {
      const res = await fetch('/api/pursuits', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: vars.id, stage: vars.stage }),
      })
      if (!res.ok) throw new Error('Stage change failed')
      return res.json()
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      toast({
        title: `Stage changed: ${STAGE_LABELS[vars.from] ?? titleCase(vars.from)} → ${STAGE_LABELS[vars.stage] ?? titleCase(vars.stage)}`,
      })
    },
    onError: () => toast({ title: 'Could not change stage', variant: 'destructive' }),
  })

  const wonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/pursuits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'won', id }),
      })
      if (!res.ok) throw new Error('Mark won failed')
      return (await res.json()) as { contractId: string }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['pursuits'] })
      setWonContractId(d.contractId)
      toast({
        title: 'Pursuit marked won — contract created in Contracts',
        description: 'Open the contract record to carry CLINs over from pricing.',
      })
    },
    onError: () => toast({ title: 'Could not mark pursuit won', variant: 'destructive' }),
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Deep link: a params.pipeline.id takes precedence until the dialog closes (both clear it).
  const openId = paramId || detailId
  const detail = data?.pursuits.find((p) => p.id === openId) ?? null
  const activeDrag = activeDragId ? (data?.pursuits.find((p) => p.id === activeDragId) ?? null) : null

  const openDetail = (id: string) => {
    if (paramId) setParam('pipeline', 'id', '')
    setDetailId(id)
  }

  const closeDetail = () => {
    setDetailId(null)
    setWonContractId(null)
    if (paramId) setParam('pipeline', 'id', '')
  }

  const boardPursuits = useMemo(
    () => (data?.pursuits ?? []).filter((p) => ACTIVE_STAGES.includes(p.stage)),
    [data],
  )

  const movePursuit = (id: string, stage: string, from: string) => stageMutation.mutate({ id, stage, from })

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    if (!e.over) return
    const targetStage = String(e.over.id)
    const p = data?.pursuits.find((x) => x.id === String(e.active.id))
    if (!p || p.stage === targetStage) return
    stageMutation.mutate({ id: p.id, stage: targetStage, from: p.stage })
  }

  const tableColumns: Column<Pursuit>[] = [
    {
      key: 'title', header: 'Title', sortValue: (p) => p.title,
      render: (p) => <div className="max-w-80 line-clamp-1 text-[13px] font-medium">{p.title}</div>,
    },
    {
      key: 'agency', header: 'Agency', sortValue: (p) => p.agency,
      render: (p) => <span className="text-muted-foreground">{p.agency}</span>,
    },
    {
      key: 'stage', header: 'Stage', sortValue: (p) => STAGE_LABELS[p.stage] ?? p.stage,
      render: (p) => <Pill tone="muted">{STAGE_LABELS[p.stage] ?? titleCase(p.stage)}</Pill>,
    },
    {
      key: 'lead', header: 'Capture lead', sortValue: (p) => p.captureLead,
      render: (p) => p.captureLead || '—',
    },
    { key: 'pwin', header: 'PWin', sortValue: (p) => p.pwin, render: (p) => <ScoreBar score={p.pwin} /> },
    { key: 'total', header: 'Total value', sortValue: (p) => p.totalValueCents, render: (p) => <Money cents={p.totalValueCents} /> },
    { key: 'weighted', header: 'Weighted value', sortValue: (p) => p.weightedValueCents, render: (p) => <Money cents={p.weightedValueCents} /> },
    {
      key: 'gate', header: 'Gate', sortValue: (p) => p.gateStatus,
      render: (p) => p.gateStatus === 'pending'
        ? <span className="text-[12.5px] text-muted-foreground">Pending</span>
        : <StatusPill status={p.gateStatus} label={p.gateStatus === 'approved' ? 'Bid' : 'No-Bid'} />,
    },
  ]

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  const activePursuits = data.pursuits.filter((p) => ACTIVE_STAGES.includes(p.stage))
  const totalValue = activePursuits.reduce((s, p) => s + p.totalValueCents, 0)
  const weightedValue = activePursuits.reduce((s, p) => s + p.weightedValueCents, 0)

  return (
    <FadeIn>
      <SectionHeader
        title="Pipeline"
        description="Pursuits from qualification through the bid decision gate, with PWin and weighted value."
        actions={
          <Tabs value={view} onValueChange={(v) => setView(v as 'board' | 'table')}>
            <TabsList className="h-9">
              <TabsTrigger value="board" className="h-7 gap-1.5 px-3 text-[12px]">
                <KanbanSquare className="h-3.5 w-3.5" /> Board
              </TabsTrigger>
              <TabsTrigger value="table" className="h-7 gap-1.5 px-3 text-[12px]">
                <Table2 className="h-3.5 w-3.5" /> Table
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="pipeline-stats">
        <StatCard label="Active pursuits" value={activePursuits.length}
          sub={`${data.pursuits.length} total including won and no-bid`} />
        <StatCard label="Pipeline value" value={<Money cents={totalValue} />}
          sub="Total value of active pursuits" />
        <StatCard label="Weighted pipeline" value={<Money cents={weightedValue} />}
          sub="Total value multiplied by PWin" tone="brand" />
      </div>

      {data.pursuits.length === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="h-7 w-7" strokeWidth={1.5} />}
          title="No pursuits yet"
          hint="Track an opportunity from the Opportunities section — BidDesk creates a pursuit at the Identified stage with match factors carried over as the first PWin estimate."
          action={
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => go('opportunities')}>
              Find opportunities <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          }
        />
      ) : view === 'board' ? (
        <div data-tour="pipeline-board">
          <DndContext
            sensors={sensors}
            onDragStart={(e) => setActiveDragId(String(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <div className="overflow-x-auto scroll-thin pb-2">
              <div className="flex min-w-max items-start gap-3">
                {ACTIVE_STAGES.map((stage) => (
                  <BoardColumn
                    key={stage}
                    stage={stage}
                    pursuits={boardPursuits.filter((p) => p.stage === stage)}
                    onOpen={openDetail}
                    onMove={movePursuit}
                  />
                ))}
              </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {activeDrag ? (
                <div className="w-64 cursor-grabbing rounded-md border bg-card p-2.5 shadow-lg">
                  <div className="line-clamp-2 text-[12.5px] font-medium leading-4">{activeDrag.title}</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{activeDrag.agency}</div>
                  <div className="mt-2"><ScoreBar score={activeDrag.pwin} /></div>
                  <div className="tnum mt-1.5 text-[11px] text-muted-foreground">
                    {fmtMoneyCompact(activeDrag.weightedValueCents)} weighted
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <DataTable
          columns={tableColumns}
          rows={data.pursuits}
          onRowClick={(p) => openDetail(p.id)}
          csvName="biddesk-pursuits"
        />
      )}

      {/* Pursuit detail */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) closeDetail() }}>
        {detail ? (
          <DialogContent className="flex max-h-[88vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-y-auto p-0 scroll-thin sm:max-w-4xl">
            <div className="border-b p-5 pb-3">
              <div className="flex items-start justify-between gap-4 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] font-semibold leading-5">{detail.title}</DialogTitle>
                  <DialogDescription className="mt-1 text-[12.5px]">
                    {detail.agency}
                    {detail.opportunity ? ` · ${detail.opportunity.solicitationNumber}` : ''}
                  </DialogDescription>
                </div>
                {wonContractId ? (
                  <Button
                    size="sm" variant="outline"
                    className="h-8 shrink-0 gap-1.5 text-[12px]"
                    onClick={() => { const id = wonContractId; closeDetail(); go('contracts', { id }) }}
                  >
                    Go to contract <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : detail.stage === 'submitted' ? (
                  <Button
                    size="sm" className="h-8 shrink-0 gap-1.5 text-[12px]"
                    disabled={wonMutation.isPending}
                    onClick={() => wonMutation.mutate(detail.id)}
                  >
                    {wonMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                    Mark won
                  </Button>
                ) : null}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Pill tone="muted">{STAGE_LABELS[detail.stage] ?? titleCase(detail.stage)}</Pill>
                {detail.gateStatus === 'pending'
                  ? <StatusPill status="pending" label="Gate pending" />
                  : <StatusPill status={detail.gateStatus} label={detail.gateStatus === 'approved' ? 'Gate: Bid' : 'Gate: No-Bid'} />}
                <ScoreBar score={detail.pwin} className="ml-1" />
              </div>
            </div>

            <Tabs defaultValue="overview" className="gap-0">
              <div className="px-5 pt-3">
                <TabsList className="h-9">
                  <TabsTrigger value="overview" className="text-[12px]">Overview</TabsTrigger>
                  <TabsTrigger value="pwin" className="text-[12px]">PWin</TabsTrigger>
                  <TabsTrigger value="gate" className="text-[12px]">Bid Gate</TabsTrigger>
                  <TabsTrigger value="teaming" className="text-[12px]">Teaming</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="overview" className="p-5 pt-4">
                <OverviewTab key={detail.id} pursuit={detail} />
              </TabsContent>
              <TabsContent value="pwin" className="p-5 pt-4">
                <PwinTab key={detail.id} pursuit={detail} />
              </TabsContent>
              <TabsContent value="gate" className="p-5 pt-4">
                <GateTab key={detail.id} pursuit={detail} gateCriteria={data.gateCriteria} />
              </TabsContent>
              <TabsContent value="teaming" className="p-5 pt-4">
                <TeamingTab key={detail.id} pursuit={detail} partners={data.partners} />
              </TabsContent>
            </Tabs>
          </DialogContent>
        ) : null}
      </Dialog>
    </FadeIn>
  )
}
