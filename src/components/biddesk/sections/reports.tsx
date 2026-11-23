'use client'

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHeader, StatCard, Pill, EmptyState, FadeIn, Money, DateText, type PillTone } from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtMoneyCompact, fmtDate, STAGE_LABELS, titleCase } from '@/lib/biddesk/format'
import {
  Gauge, Target, Timer, Briefcase, ClipboardCheck, Award, CalendarClock, Download,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type StageRow = { stage: string; count: number; valueCents: number; weightedCents: number }
type Reason = { title: string; reason: string }

type ReportsData = {
  pipelineByStage: StageRow[]
  winLoss: {
    won: number; lost: number; noBids: number; winRate: number
    lossReasons: Reason[]; noBidReasons: Reason[]
  }
  quarters: { label: string; bids: number; wins: number }[]
  cycleTimes: { title: string; days: number }[]
  avgCycleDays: number
  portfolio: { activeContracts: number; totalValueCents: number; backlogCents: number; fundedCents: number; unfundedCents: number }
  deliverables: { total: number; onTime: number; late: number; timelinessPct: number }
  cparsTrend: { period: string; rating: string; value: number }[]
  calendar: { date: string; label: string; kind: string }[]
}

/* -------------------------------- helpers --------------------------------- */

function csvDownload(name: string, rows: (string | number)[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const CPARS_TONE: Record<string, PillTone> = {
  Exceptional: 'success', 'Very Good': 'info', Satisfactory: 'muted', Marginal: 'warning', Unsatisfactory: 'danger',
}

function ReportCard({
  title, icon, csv, children, className,
}: { title: string; icon: ReactNode; csv: () => void; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="text-muted-foreground">{icon}</span> {title}
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-[12px] gap-1" onClick={csv}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------- component -------------------------------- */

export function ReportsSection() {
  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ['reports'],
    queryFn: async () => (await fetch('/api/reports')).json(),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    )
  }

  const d = data

  /* pipeline */
  const maxStageValue = Math.max(...d.pipelineByStage.map((s) => s.valueCents), 1)
  const weightedTotal = d.pipelineByStage.reduce((s, x) => s + x.weightedCents, 0)

  /* quarters */
  const maxBids = Math.max(...d.quarters.map((x) => x.bids), 1)
  const quarterAria = d.quarters.map((x) => `${x.label}: ${x.bids} bids, ${x.wins} wins`).join('; ')

  /* cycle times */
  const maxDays = Math.max(...d.cycleTimes.map((c) => c.days), 1)

  /* portfolio */
  const obligated = d.portfolio.fundedCents + d.portfolio.unfundedCents
  const fundedPct = obligated > 0 ? (d.portfolio.fundedCents / obligated) * 100 : 0

  /* timeliness donut */
  const R = 30
  const CIRC = 2 * Math.PI * R
  const onTimeFrac = d.deliverables.total > 0 ? d.deliverables.onTime / d.deliverables.total : 1

  return (
    <FadeIn>
      <SectionHeader title="Reports" description="Computed live from your records. Export as CSV." />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 1. Pipeline by stage */}
        <ReportCard
          title="Pipeline by stage" icon={<Gauge className="h-4 w-4" />}
          csv={() => csvDownload('pipeline-by-stage', [
            ['Stage', 'Pursuits', 'Value', 'Weighted value'],
            ...d.pipelineByStage.map((s) => [
              STAGE_LABELS[s.stage] ?? titleCase(s.stage), s.count, fmtMoney(s.valueCents), fmtMoney(s.weightedCents),
            ]),
            ['Weighted total', '', '', fmtMoney(weightedTotal)],
          ])}
        >
          <div className="space-y-2.5">
            {d.pipelineByStage.map((s) => {
              const label = STAGE_LABELS[s.stage] ?? titleCase(s.stage)
              return (
                <div key={s.stage} className="grid grid-cols-[104px_1fr] sm:grid-cols-[128px_1fr_auto] items-center gap-3">
                  <span className="truncate text-[12px] text-muted-foreground">{label}</span>
                  <div className="h-2 rounded-full bg-muted overflow-hidden" role="img"
                    aria-label={`${label}: ${fmtMoney(s.valueCents)} across ${s.count} pursuits`}>
                    <div className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-500"
                      style={{ width: `${Math.max((s.valueCents / maxStageValue) * 100, s.count > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className="tnum hidden sm:block text-[12px] text-right w-32">
                    {fmtMoneyCompact(s.valueCents)} · {s.count}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
            <span className="text-[12px] text-muted-foreground">Weighted pipeline (PWin-adjusted)</span>
            <span className="text-[13px] font-semibold"><Money cents={weightedTotal} /></span>
          </div>
        </ReportCard>

        {/* 2. Win rate and bid volume */}
        <ReportCard
          title="Win rate & bid volume" icon={<Target className="h-4 w-4" />}
          csv={() => csvDownload('win-rate', [
            ['Metric', 'Value'],
            ['Win rate %', d.winLoss.winRate],
            ['Won', d.winLoss.won], ['Lost', d.winLoss.lost], ['No-bids', d.winLoss.noBids],
            ['Quarter', 'Bids', 'Wins'],
            ...d.quarters.map((x) => [x.label, x.bids, x.wins]),
            ['Loss reason', 'Detail'], ...d.winLoss.lossReasons.map((r) => [r.title, r.reason]),
            ['No-bid reason', 'Detail'], ...d.winLoss.noBidReasons.map((r) => [r.title, r.reason]),
          ])}
        >
          <div className="flex flex-wrap items-start gap-4 mb-4">
            <div>
              <div className="tnum text-2xl font-semibold leading-7">{d.winLoss.winRate}%</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Win rate</div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-md border bg-card px-2.5 py-1.5 text-center">
                <div className="tnum text-[15px] font-semibold text-[var(--success)]">{d.winLoss.won}</div>
                <div className="text-[10.5px] text-muted-foreground">Won</div>
              </span>
              <span className="rounded-md border bg-card px-2.5 py-1.5 text-center">
                <div className="tnum text-[15px] font-semibold text-[var(--danger)]">{d.winLoss.lost}</div>
                <div className="text-[10.5px] text-muted-foreground">Lost</div>
              </span>
              <span className="rounded-md border bg-card px-2.5 py-1.5 text-center">
                <div className="tnum text-[15px] font-semibold text-muted-foreground">{d.winLoss.noBids}</div>
                <div className="text-[10.5px] text-muted-foreground">No-bids</div>
              </span>
            </div>
          </div>
          {d.quarters.every((x) => x.bids === 0) ? (
            <p className="text-[12.5px] text-muted-foreground py-4">No bid decisions recorded in the last four quarters.</p>
          ) : (
            <div className="mb-3">
              <div className="flex items-end justify-between gap-4 h-24 px-1" role="img" aria-label={`Bids and wins by quarter — ${quarterAria}`}>
                {d.quarters.map((x) => (
                  <div key={x.label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex items-end gap-1 h-20">
                      <div className="w-3.5 rounded-t bg-[var(--chart-1)] transition-all duration-500"
                        style={{ height: `${(x.bids / maxBids) * 100}%` }} title={`${x.bids} bids`} />
                      <div className="w-3.5 rounded-t bg-[var(--success)] transition-all duration-500"
                        style={{ height: `${(x.wins / maxBids) * 100}%` }} title={`${x.wins} wins`} />
                    </div>
                    <span className="tnum text-[11px] text-muted-foreground">{x.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <Legend items={[
                  { color: 'var(--chart-1)', label: 'Bids' },
                  { color: 'var(--success)', label: 'Wins' },
                ]} />
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4 border-t pt-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Loss reasons</div>
              {d.winLoss.lossReasons.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No losses recorded.</p>
              ) : (
                <ul className="space-y-1.5 max-h-36 overflow-y-auto scroll-thin pr-1">
                  {d.winLoss.lossReasons.map((r, i) => (
                    <li key={i}>
                      <div className="text-[12.5px] font-medium leading-4 truncate" title={r.title}>{r.title}</div>
                      <div className="text-[11.5px] text-muted-foreground line-clamp-2">{r.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">No-bid reasons</div>
              {d.winLoss.noBidReasons.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No no-bid decisions recorded.</p>
              ) : (
                <ul className="space-y-1.5 max-h-36 overflow-y-auto scroll-thin pr-1">
                  {d.winLoss.noBidReasons.map((r, i) => (
                    <li key={i}>
                      <div className="text-[12.5px] font-medium leading-4 truncate" title={r.title}>{r.title}</div>
                      <div className="text-[11.5px] text-muted-foreground line-clamp-2">{r.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ReportCard>

        {/* 3. Proposal cycle time */}
        <ReportCard
          title="Proposal cycle time" icon={<Timer className="h-4 w-4" />}
          csv={() => csvDownload('proposal-cycle-time', [
            ['Proposal', 'Cycle days'],
            ...d.cycleTimes.map((c) => [c.title, c.days]),
            ['Average', d.avgCycleDays],
          ])}
        >
          <div className="mb-4">
            <div className="tnum text-2xl font-semibold leading-7">{d.avgCycleDays}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Average cycle days · intake to submission</div>
          </div>
          {d.cycleTimes.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No proposals recorded yet.</p>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto scroll-thin pr-1">
              {d.cycleTimes.map((c) => (
                <div key={c.title}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[12px] truncate" title={c.title}>{c.title}</span>
                    <span className="tnum text-[12px] text-muted-foreground shrink-0">{c.days}d</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="img"
                    aria-label={`${c.title}: ${c.days} days`}>
                    <div className="h-full rounded-full bg-[var(--chart-4)] transition-all duration-500"
                      style={{ width: `${(c.days / maxDays) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportCard>

        {/* 4. Contract portfolio */}
        <ReportCard
          title="Contract portfolio" icon={<Briefcase className="h-4 w-4" />}
          csv={() => csvDownload('contract-portfolio', [
            ['Metric', 'Value'],
            ['Active contracts', d.portfolio.activeContracts],
            ['Total value', fmtMoney(d.portfolio.totalValueCents)],
            ['Backlog', fmtMoney(d.portfolio.backlogCents)],
            ['Funded', fmtMoney(d.portfolio.fundedCents)],
            ['Unfunded', fmtMoney(d.portfolio.unfundedCents)],
          ])}
        >
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Active contracts" value={d.portfolio.activeContracts} />
            <StatCard label="Total value" value={<Money cents={d.portfolio.totalValueCents} />} />
            <StatCard label="Backlog" value={<Money cents={d.portfolio.backlogCents} />} />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Funded vs unfunded (obligated)</div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="img"
            aria-label={`Funded ${fmtMoney(d.portfolio.fundedCents)} of ${fmtMoney(obligated)} obligated`}>
            <div className="h-full bg-[var(--success)]" style={{ width: `${fundedPct}%` }} />
            <div className="h-full bg-[var(--warning)]" style={{ width: `${100 - fundedPct}%` }} />
          </div>
          <div className="mt-2">
            <Legend items={[
              { color: 'var(--success)', label: `Funded ${fmtMoneyCompact(d.portfolio.fundedCents)}` },
              { color: 'var(--warning)', label: `Unfunded ${fmtMoneyCompact(d.portfolio.unfundedCents)}` },
            ]} />
          </div>
        </ReportCard>

        {/* 5. Deliverable timeliness */}
        <ReportCard
          title="Deliverable timeliness" icon={<ClipboardCheck className="h-4 w-4" />}
          csv={() => csvDownload('deliverable-timeliness', [
            ['Metric', 'Value'],
            ['Total deliverables', d.deliverables.total],
            ['On time', d.deliverables.onTime],
            ['Late', d.deliverables.late],
            ['Timeliness %', d.deliverables.timelinessPct],
          ])}
        >
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 80 80" className="h-28 w-28 shrink-0" role="img"
              aria-label={`Deliverable timeliness: ${d.deliverables.timelinessPct} percent on time, ${d.deliverables.late} late of ${d.deliverables.total} total`}>
              <circle cx="40" cy="40" r={R} fill="none" stroke="var(--danger)" strokeWidth="9" />
              <circle cx="40" cy="40" r={R} fill="none" stroke="var(--success)" strokeWidth="9"
                strokeDasharray={`${CIRC * onTimeFrac} ${CIRC}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
              <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="600" fill="currentColor" className="tnum">
                {d.deliverables.timelinessPct}%
              </text>
            </svg>
            <div className="space-y-2">
              <div>
                <div className="tnum text-2xl font-semibold leading-7">{d.deliverables.timelinessPct}%</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">On-time rate</div>
              </div>
              <div className="flex gap-2">
                <span className="rounded-md border bg-card px-2.5 py-1.5 text-center">
                  <div className="tnum text-[15px] font-semibold text-[var(--success)]">{d.deliverables.onTime}</div>
                  <div className="text-[10.5px] text-muted-foreground">On time</div>
                </span>
                <span className="rounded-md border bg-card px-2.5 py-1.5 text-center">
                  <div className="tnum text-[15px] font-semibold text-[var(--danger)]">{d.deliverables.late}</div>
                  <div className="text-[10.5px] text-muted-foreground">Late</div>
                </span>
              </div>
              <p className="text-[11.5px] text-muted-foreground">Across {d.deliverables.total} tracked deliverable{d.deliverables.total === 1 ? '' : 's'}.</p>
            </div>
          </div>
        </ReportCard>

        {/* 6. CPARS trend */}
        <ReportCard
          title="CPARS trend" icon={<Award className="h-4 w-4" />}
          csv={() => csvDownload('cpars-trend', [
            ['Period', 'Rating'],
            ...d.cparsTrend.map((c) => [c.period, c.rating]),
          ])}
        >
          {d.cparsTrend.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No CPARS evaluations recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {d.cparsTrend.map((c) => (
                <li key={c.period} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="tnum text-[12.5px] font-medium">{c.period}</span>
                  <Pill tone={CPARS_TONE[c.rating] ?? 'muted'}>{c.rating}</Pill>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        {/* 7. Option & recompete calendar */}
        <ReportCard
          title="Option & recompete calendar" icon={<CalendarClock className="h-4 w-4" />}
          className="lg:col-span-2"
          csv={() => csvDownload('option-recompete-calendar', [
            ['Date', 'Event', 'Type'],
            ...d.calendar.map((c) => [fmtDate(c.date), c.label, titleCase(c.kind)]),
          ])}
        >
          {d.calendar.length === 0 ? (
            <EmptyState title="No upcoming options or recompetes" hint="Option exercise windows and recompete planning dates from active contracts appear here." icon={<CalendarClock className="h-7 w-7" strokeWidth={1.5} />} />
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-thin -m-1 p-1">
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th className="text-left">Date</th>
                    <th className="text-left">Event</th>
                    <th className="text-left w-28">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {d.calendar.map((c, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap"><DateText d={c.date} /></td>
                      <td>{c.label}</td>
                      <td>
                        <Pill tone={c.kind === 'option' ? 'info' : 'warning'}>{titleCase(c.kind)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      </div>
    </FadeIn>
  )
}
