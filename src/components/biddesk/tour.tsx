'use client'

import { useEffect, useState } from 'react'
import { useBidStore, type SectionKey } from '@/lib/biddesk/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, X, Play } from 'lucide-react'

export type TourStep = {
  section: SectionKey
  title: string
  body: string
  target?: string // data-tour attribute selector
  params?: Record<string, string>
}

/** The guided walkthrough: follows the lifecycle Find → Capture → Propose → Price → Manage. */
export const TOUR_STEPS: TourStep[] = [
  {
    section: 'dashboard',
    title: 'Welcome to BidDesk',
    body: 'This is your dashboard: tasks, the next 30 days, pipeline value, proposals in progress, and contracts needing action — all computed from live records. The walkthrough follows the contract lifecycle: find opportunities, decide whether to bid, write the proposal, price it, then manage the award.',
  },
  {
    section: 'opportunities',
    title: '1 — Find opportunities',
    body: 'Notices sync from SAM.gov for federal work; manual entry, CSV import, and email-forward intake cover state and local. Every match score is transparent — open the factor breakdown to see exactly why a notice ranked, and dismiss with a reason to tune future matches.',
    target: 'opportunities-table',
  },
  {
    section: 'opportunities',
    title: '1 — Track what fits',
    body: 'When a notice is worth pursuing, Track moves it into the pipeline with its match factors carried over as a first PWin estimate. Nothing is retyped.',
    target: 'opportunities-table',
  },
  {
    section: 'pipeline',
    title: '2 — Decide whether to bid',
    body: 'The pipeline board moves pursuits through qualification, capture planning, and the bid/no-bid gate. Drag cards between stages, adjust PWin factor scores with sliders — weighted value recalculates live.',
    target: 'pipeline-board',
  },
  {
    section: 'pipeline',
    title: '2 — The bid decision gate',
    body: 'Open a pursuit to run the gate review: a weighted scorecard, approval sign-off, and win themes. A Bid decision moves the pursuit forward; a No-Bid requires a reason that feeds win/loss reporting.',
    target: 'pipeline-board',
  },
  {
    section: 'proposals',
    title: '3 — Respond to the solicitation',
    body: 'Upload the solicitation and BidDesk extracts every shall/must requirement across Section L, Section M, the PWS, CDRLs, and clauses — with page and paragraph citations. Humans verify each row; the coverage meter tracks readiness.',
    target: 'proposals-list',
  },
  {
    section: 'proposals',
    title: '3 — Write with grounded drafts',
    body: 'The writing workspace pairs each outline section with its requirements. Draft from library assembles text ONLY from your approved past performance and boilerplate — every claim carries a citation you can inspect, and insufficient support returns a needs-input response instead of invented text.',
    target: 'proposals-list',
  },
  {
    section: 'pricing',
    title: '4 — Price the bid',
    body: 'The pricer builds loaded rates from your indirect structure (fringe, overhead, G&A, fee) with decimal-safe math, escalates across option periods, and rolls up CLIN totals. Change any input — rates, escalation, hours — and totals, sensitivity, and benchmark comparisons update instantly.',
    target: 'pricing-model',
  },
  {
    section: 'contracts',
    title: '5 — Manage the award',
    body: 'Winning flows into contract management: CLINs and funding, deliverables with due schedules, modifications, option exercise windows, CPARS tracking, and closeout. Closing a contract can generate a past-performance record for the Library.',
    target: 'contracts-list',
  },
  {
    section: 'library',
    title: '6 — Feed the next bid',
    body: 'The Library holds your company profile, past performance, resumes, and approved content. Only approved items are eligible for grounded drafting — the same records that cited themselves in your last proposal.',
    target: 'library-content',
  },
  {
    section: 'dashboard',
    title: 'One system of record',
    body: 'That is the lifecycle: Opportunity → Pursuit → Proposal → Pricing → Contract → Past Performance, with nothing retyped between phases. Explore any section freely, or ask the Assistant (top right) about your records.',
  },
]

export function TourOverlay({ steps }: { steps: TourStep[] }) {
  const { tourActive, tourStep, setTourStep, endTour, go } = useBidStore()
  const [highlight, setHighlight] = useState<HTMLElement | null>(null)

  const step = steps[tourStep]

  useEffect(() => {
    if (!tourActive || !step) return
    go(step.section, step.params)
  }, [tourActive, tourStep, step, go])

  useEffect(() => {
    if (!tourActive || !step) return
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      const el = step?.target
        ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null)
        : null
      setHighlight(el)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [tourActive, tourStep, step])

  if (!tourActive || !step) return null

  const next = () => tourStep < steps.length - 1 ? setTourStep(tourStep + 1) : endTour()
  const prev = () => tourStep > 0 ? setTourStep(tourStep - 1) : null

  return (
    <>
      <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={step.title}>
        {highlight ? null : <div className="absolute inset-0 bg-black/45" />}
      </div>

      {highlight ? (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute inset-0 bg-black/45"
            style={{ clipPath: `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%)` }} />
          <div className="tour-spotlight absolute"
            style={{
              top: highlight.offsetTop - 4,
              left: highlight.offsetLeft - 4,
              width: highlight.offsetWidth + 8,
              height: highlight.offsetHeight + 8,
            }}
            data-tour-spotlight />
        </div>
      ) : null}

      {/* Card */}
      <div className="fixed z-50 bottom-6 left-1/2 -translate-x-1/2 w-[min(92vw,520px)] no-print"
        style={{ top: highlight ? undefined : '50%', transform: highlight ? undefined : 'translate(-50%, -50%)' }}>
        <div className="rounded-xl border bg-card shadow-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                Walkthrough — step {tourStep + 1} of {steps.length}
              </div>
              <h3 className="text-[15px] font-semibold mt-0.5">{step.title}</h3>
            </div>
            <button onClick={endTour} className="text-muted-foreground hover:text-foreground focus-ring rounded" aria-label="Skip walkthrough">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{step.body}</p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1" role="tablist" aria-label="Walkthrough progress">
              {steps.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === tourStep} aria-label={`Step ${i + 1}`}
                  className={cn('h-1.5 rounded-full transition-all', i === tourStep ? 'w-5 bg-[var(--brand)]' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground')}
                  onClick={() => setTourStep(i)} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {prev ? <Button variant="outline" size="sm" className="h-8" onClick={prev}><ChevronLeft className="h-3.5 w-3.5" /> Back</Button> : null}
              <Button size="sm" className="h-8" onClick={next}>
                {tourStep < steps.length - 1 ? <>Next <ChevronRight className="h-3.5 w-3.5" /></> : <>Finish <Play className="h-3 w-3" /></>}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
