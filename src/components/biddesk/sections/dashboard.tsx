'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBidStore } from '@/lib/biddesk/store'
import { SectionHeader, StatCard, Pill, CoverageMeter, EmptyState, Money, DateText, FadeIn } from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtMoneyCompact, fmtRelative, STAGE_LABELS, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  CheckCircle2, Circle, CalendarClock, FileText, FolderKanban, Radar,
  ClipboardList, TriangleAlert, ArrowRight, Gauge,
} from 'lucide-react'

type Task = {
  id: string; title: string; detail: string; dueDate: string; priority: string
  recordType: string; recordId: string; recordLabel: string
}
type TimelineItem = { date: string; kind: string; label: string; recordType: string; recordId: string }
type DashboardData = {
  myTasks: Task[]
  timeline: TimelineItem[]
  pipelineByStage: { stage: string; count: number; valueCents: number; weightedCents: number }[]
  pipelineSummary: { activeCount: number; valueCents: number; weightedCents: number }
  proposalsInProgress: { id: string; title: string; status: string; dueAt: string; daysRemaining: number; coveragePct: number; sectionsWritten: number; sectionsTotal: number }[]
  contractsNeedingAction: { id: string; number: string; agency: string; status: string; issues: string[] }[]
  recommended: { id: string; title: string; agency: string; matchScore: number; responseDeadline: string | null; valueLabel: string; matchFactors: { label: string; score: number; detail: string }[] }[]
  unreadNotifications: number
}

const KIND_ICON: Record<string, string> = {
  solicitation: 'text-[var(--brand)]', deliverable: 'text-[var(--warning)]',
  option: 'text-[var(--success)]', cpars: 'text-[var(--danger)]', gate: 'text-[var(--info)]',
}

export function DashboardSection() {
  const go = useBidStore((s) => s.go)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => (await fetch('/api/dashboard')).json(),
  })

  const completeTask = useMutation({
    mutationFn: async (id: string) =>
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Task completed' })
    },
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const maxStageValue = Math.max(...data.pipelineByStage.map((s) => s.valueCents), 1)
  const proposalsNeedingAttention = data.proposalsInProgress.filter((p) => p.daysRemaining <= 21)

  return (
    <FadeIn>
      <SectionHeader
        title="Dashboard"
        description="Tasks, deadlines, and portfolio health — computed from live records."
        actions={<Button size="sm" variant="outline" className="h-8" onClick={() => go('opportunities')}>Find opportunities <ArrowRight className="h-3.5 w-3.5" /></Button>}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-tour="dashboard-stats">
        <StatCard label="Weighted pipeline" value={<Money cents={data.pipelineSummary.weightedCents} />}
          sub={`${data.pipelineSummary.activeCount} active pursuits · ${fmtMoneyCompact(data.pipelineSummary.valueCents)} total`} tone="brand" />
        <StatCard label="Proposals in progress" value={data.proposalsInProgress.length}
          sub={proposalsNeedingAttention.length ? `${proposalsNeedingAttention.length} due within 3 weeks` : 'No near-term due dates'} />
        <StatCard label="Contracts needing action" value={data.contractsNeedingAction.length}
          sub="Deliverables, options, or CPARS" tone={data.contractsNeedingAction.length ? 'warning' : 'default'} />
        <StatCard label="Top match score" value={(data.recommended[0]?.matchScore ?? 0) + '%'}
          sub={data.recommended[0] ? data.recommended[0].agency : 'No new notices'} tone="success" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column: tasks + timeline */}
        <div className="flex flex-col gap-4">
          {/* My tasks */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" /> My tasks
              </h3>
              <Pill tone="muted">{data.myTasks.length} open</Pill>
            </div>
            <div className="max-h-80 overflow-y-auto scroll-thin divide-y">
              {data.myTasks.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No open tasks assigned to you. New assignments appear here automatically.
                </div>
              ) : data.myTasks.map((t) => {
                const rel = fmtRelative(t.dueDate)
                return (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <Checkbox className="mt-0.5" aria-label={`Complete ${t.title}`}
                      onCheckedChange={() => completeTask.mutate(t.id)} />
                    <button className="min-w-0 flex-1 text-left"
                      onClick={() => go(t.recordType === 'proposal' ? 'proposals' : t.recordType === 'pursuit' ? 'pipeline' : t.recordType === 'contract' ? 'contracts' : t.recordType === 'pricing' ? 'pricing' : 'library', t.recordId ? { id: t.recordId } : undefined)}>
                      <div className="text-[13px] font-medium leading-4 truncate">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{t.recordLabel}</div>
                    </button>
                    <Pill tone={rel.tone === 'past' ? 'danger' : rel.tone === 'today' || rel.tone === 'soon' ? 'warning' : 'muted'}>
                      {rel.text}
                    </Pill>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Next 30 days */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" /> Next 30 days
              </h3>
              <Pill tone="muted">{data.timeline.length} events</Pill>
            </div>
            <div className="max-h-96 overflow-y-auto scroll-thin">
              {data.timeline.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  Nothing scheduled in the next 30 days. Proposal due dates, reviews, deliverables, option windows, and CPARS deadlines appear here.
                </div>
              ) : (
                <div className="divide-y">
                  {data.timeline.map((e, i) => (
                    <button key={i} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/40"
                      onClick={() => go(e.recordType === 'proposal' ? 'proposals' : e.recordType === 'pursuit' ? 'pipeline' : 'contracts', { id: e.recordId })}>
                      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted', KIND_ICON[e.kind])}>
                        {e.kind === 'solicitation' ? <FileText className="h-3.5 w-3.5" /> :
                         e.kind === 'deliverable' ? <ClipboardList className="h-3.5 w-3.5" /> :
                         e.kind === 'option' ? <Gauge className="h-3.5 w-3.5" /> :
                         <TriangleAlert className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium leading-4 truncate">{e.label}</div>
                        <div className="text-[11px] text-muted-foreground"><DateText d={e.date} /></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middle + right: pipeline, proposals, contracts, matches */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Pipeline by stage */}
          <div className="rounded-lg border bg-card" data-tour="dashboard-pipeline">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" /> Pipeline by stage
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => go('pipeline')}>
                Open pipeline <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.pipelineByStage.map((s) => (
                <button key={s.stage}
                  className="rounded-md border bg-background/50 p-2.5 text-left hover:border-[var(--brand)] transition-colors"
                  onClick={() => go('pipeline')}>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{STAGE_LABELS[s.stage] ?? titleCase(s.stage)}</div>
                  <div className="tnum text-lg font-semibold leading-6 mt-0.5">{s.count}</div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${(s.valueCents / maxStageValue) * 100}%` }} />
                  </div>
                  <div className="tnum text-[10.5px] text-muted-foreground mt-1">
                    {fmtMoneyCompact(s.valueCents)} · {fmtMoneyCompact(s.weightedCents)} weighted
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Proposals in progress */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Proposals in progress
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => go('proposals')}>
                Open proposals <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {data.proposalsInProgress.length === 0 ? (
              <EmptyState title="No proposals in progress" hint="Track an opportunity and complete its bid decision to open a proposal workspace." icon={<FileText className="h-7 w-7" strokeWidth={1.5} />} />
            ) : (
              <div className="divide-y">
                {data.proposalsInProgress.map((p) => (
                  <button key={p.id} className="w-full px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-left hover:bg-muted/40"
                    onClick={() => go('proposals', { id: p.id })}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{p.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.sectionsWritten}/{p.sectionsTotal} sections drafted or final · due <DateText d={p.dueAt} />
                      </div>
                    </div>
                    <CoverageMeter value={p.coveragePct} label="Compliance" />
                    <Pill tone={p.daysRemaining <= 7 ? 'danger' : p.daysRemaining <= 21 ? 'warning' : 'muted'}>
                      {p.daysRemaining} days left
                    </Pill>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contracts needing action */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" /> Contracts needing action
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => go('contracts')}>
                Open contracts <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {data.contractsNeedingAction.length === 0 ? (
              <EmptyState title="No contract actions pending" hint="Deliverables, option windows, and CPARS responses that need attention will surface here." icon={<CheckCircle2 className="h-7 w-7 text-[var(--success)]" strokeWidth={1.5} />} />
            ) : (
              <div className="divide-y">
                {data.contractsNeedingAction.map((c) => (
                  <button key={c.id} className="w-full px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => go('contracts', { id: c.id })}>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[13px] font-semibold">{c.number}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{c.agency}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.issues.slice(0, 3).map((issue, i) => (
                        <Pill key={i} tone={issue.includes('late') ? 'danger' : 'warning'}>{issue}</Pill>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recommended opportunities */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-[13px] font-semibold flex items-center gap-2">
                <Radar className="h-4 w-4 text-muted-foreground" /> Recommended opportunities
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => go('opportunities')}>
                All opportunities <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {data.recommended.length === 0 ? (
              <EmptyState title="No recommended matches yet" hint="Add a SAM.gov API key in Settings to sync live notices, or add opportunities manually for state and local work." icon={<Radar className="h-7 w-7" strokeWidth={1.5} />} />
            ) : (
              <div className="divide-y">
                {data.recommended.map((o) => (
                  <button key={o.id} className="w-full px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => go('opportunities', { id: o.id })}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium leading-4 line-clamp-1">{o.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {o.agency}{o.valueLabel ? ` · ${o.valueLabel}` : ''}{o.responseDeadline ? ` · due ${fmtRelative(o.responseDeadline).text.toLowerCase()}` : ''}
                        </div>
                      </div>
                      <Pill tone="success" className="shrink-0">Match {o.matchScore}</Pill>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {o.matchFactors.slice(0, 3).map((f, i) => (
                        <span key={i} className="text-[10.5px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                          {f.label}: {f.score}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
