'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBidStore } from '@/lib/biddesk/store'
import {
  SectionHeader, StatCard, Pill, StatusPill, EmptyState, DataTable, FadeIn, Money, DateText, FilterInput,
  type Column, type PillTone,
} from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtMoneyCompact, fmtRate, fmtBps } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  ArrowLeft, ArrowRight, Calculator, Percent, Sigma, Info, Clock3, TrendingUp,
  CalendarRange, Package, FileSpreadsheet, BarChart3, Activity,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type PeriodDef = { label: string; startDate: string; endDate: string; months: number }

type RateSetRow = {
  id: string; name: string; effectiveDate: string; source: string; status: string
  fringeBps: number; overheadBps: number; overheadGovBps: number; materialHandlingBps: number
  gaBps: number; feeBps: number
  laborCategories: { id: string; title: string; baseRateCents: number; benchmarkLowCents: number; benchmarkHighCents: number }[]
}

type ModelRow = { id: string; name: string; contractType: string; status: string; escalationBps: number; periods: PeriodDef[]; proposalTitle: string }

type PricingListData = { rateSets: RateSetRow[]; models: ModelRow[] }

type LoadedRate = {
  lcatId: string; lcatTitle: string; baseRateCents: number
  fringe: number; overhead: number; cost: number; ga: number; totalCost: number; fee: number; price: number
  benchmarkLowCents: number; benchmarkHighCents: number
}

type PeriodTotal = {
  periodIndex: number; label: string; laborCostCents: number; odcCents: number
  totalCostCents: number; priceCents: number; clinRef: string
}

type Engine = {
  rateSet: { id: string; name: string; fringeBps: number; overheadBps: number; gaBps: number; feeBps: number; materialHandlingBps: number; overheadGovBps: number; source: string; effectiveDate: string }
  periods: PeriodDef[]
  escalationBps: number
  loadedRates: LoadedRate[]
  hours: { lcatId: string; lcatTitle: string; hours: number[] }[]
  odcLines: { title: string; periodIndex: number; unitCostCents: number }[]
  periodTotals: PeriodTotal[]
  grandTotal: { costCents: number; priceCents: number }
  clins: { ref: string; name: string; type: string; periodLabel: string; valueCents: number }[]
}

type ModelDetail = {
  engine: Engine
  scenarios: { feeMinus: Engine; feePlus: Engine; escMinus: Engine; escPlus: Engine; hoursMinus: Engine; hoursPlus: Engine }
  model: { id: string; name: string; contractType: string; status: string; proposalId: string | null }
}

type ContractLite = { id: string; number: string; agency: string }

/* -------------------------------- helpers --------------------------------- */

const parseInt0 = (v: string | undefined): number => {
  const n = parseInt(v ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const parsePercentToBps = (v: string, fallbackBps: number): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : fallbackBps
}

const signedMoney = (cents: number): string => (cents >= 0 ? '+' : '\u2212') + fmtMoney(Math.abs(cents))

const signedPct = (delta: number, base: number): string =>
  base === 0 ? '\u2014' : (delta >= 0 ? '+' : '\u2212') + Math.abs((delta / base) * 100).toFixed(1) + '%'

const fmtHours = (n: number): string => n.toLocaleString('en-US')

const hoursSignature = (hours: Engine['hours']): string =>
  hours.map((h) => `${h.lcatId}:${h.hours.join(',')}`).join('|')

const SOURCE_TONE: Record<string, PillTone> = { FPRA: 'info', Provisional: 'warning', Actual: 'success' }

/** PATCH /api/pricing — the engine recomputes server-side; invalidation refetches it. */
function usePricingPatch(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/pricing', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
      })
      if (!res.ok) throw new Error('Update failed')
      return (await res.json()) as { engine: Engine }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing', id] })
      qc.invalidateQueries({ queryKey: ['pricing'] })
    },
    onError: () => toast({ title: 'Update failed', description: 'Check the entered values and try again.', variant: 'destructive' }),
  })
}

/* ------------------------------- section root ------------------------------ */

export function PricingSection() {
  const params = useBidStore((s) => s.params.pricing)
  const go = useBidStore((s) => s.go)
  // The selected model lives in local state; it is seeded from store params so deep
  // links (dashboard tasks) open the model directly. The back button clears both.
  const [selectedId, setSelectedId] = useState<string | null>(params?.id ?? null)

  if (selectedId) {
    return (
      <ModelWorkspace
        id={selectedId}
        onBack={() => { setSelectedId(null); go('pricing', {}) }}
      />
    )
  }
  return <PricingList onSelect={setSelectedId} />
}

/* ------------------------------- list state -------------------------------- */

function PricingList({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery<PricingListData>({
    queryKey: ['pricing'],
    queryFn: async () => (await fetch('/api/pricing')).json(),
  })

  if (isLoading || !data) {
    return (
      <FadeIn>
        <SectionHeader title="Pricing" description="Loaded rates, CLIN build-ups, and sensitivity — decimal-safe math, benchmarked against CALC+ ranges." />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div className="xl:col-span-2 space-y-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-56" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-56" />
          </div>
        </div>
      </FadeIn>
    )
  }

  const activeRs = data.rateSets.find((r) => r.status === 'active') ?? data.rateSets[0]
  const otherRs = activeRs ? data.rateSets.filter((r) => r.id !== activeRs.id) : data.rateSets
  const needle = q.trim().toLowerCase()
  const models = data.models.filter((m) => `${m.name} ${m.proposalTitle}`.toLowerCase().includes(needle))

  const columns: Column<ModelRow>[] = [
    {
      key: 'name', header: 'Model', sortValue: (m) => m.name,
      render: (m) => (
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{m.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{m.proposalTitle || 'Not linked to a proposal'}</div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (m) => m.contractType, render: (m) => <Pill tone="muted">{m.contractType}</Pill> },
    { key: 'esc', header: 'Escalation', className: 'text-right tnum', sortValue: (m) => m.escalationBps, render: (m) => fmtBps(m.escalationBps) },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusPill status={m.status} /> },
  ]

  return (
    <FadeIn>
      <SectionHeader
        title="Pricing"
        description="Loaded rates, CLIN build-ups, and sensitivity — decimal-safe math, benchmarked against CALC+ ranges."
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Pricing models */}
        <section aria-label="Pricing models" className="xl:col-span-2" data-tour="pricing-model">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-[13px] font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />Pricing models
            </h2>
            <FilterInput value={q} onChange={setQ} placeholder="Search models…" />
          </div>
          <DataTable
            columns={columns}
            rows={models}
            csvName="pricing-models"
            onRowClick={(m) => onSelect(m.id)}
            empty={
              <EmptyState
                title="No pricing models"
                hint="Pricing models are created when a pursuit reaches the pricing stage. Track an opportunity and pass its bid decision to start one."
                icon={<Calculator className="h-7 w-7" strokeWidth={1.5} />}
              />
            }
          />
        </section>

        {/* Rate sets */}
        <section aria-label="Rate sets">
          <h2 className="text-[13px] font-semibold flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-muted-foreground" />Rate sets
          </h2>
          <div className="rounded-lg border bg-card">
            {activeRs ? (
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-semibold leading-5">{activeRs.name}</div>
                  <Pill tone={SOURCE_TONE[activeRs.source] ?? 'muted'}>{activeRs.source}</Pill>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground mt-0.5">
                  <span>Effective <DateText d={activeRs.effectiveDate} /></span>
                  <span aria-hidden>·</span>
                  <StatusPill status={activeRs.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
                  {[
                    { label: 'Fringe (on base)', bps: activeRs.fringeBps },
                    { label: 'Overhead (on base + fringe)', bps: activeRs.overheadBps },
                    { label: 'G&A (on cost)', bps: activeRs.gaBps },
                    { label: 'Fee (on total cost)', bps: activeRs.feeBps },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{r.label}</div>
                      <div className="tnum text-lg font-semibold leading-6 mt-0.5">{fmtBps(r.bps)}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-4 pt-3 flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Labor categories</span>
                  <span className="tnum font-semibold">{activeRs.laborCategories.length}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Open a pricing model to edit rates, escalation, and hours — every total recomputes.</p>
              </div>
            ) : (
              <EmptyState
                title="No rate set"
                hint="An active rate set (fringe, overhead, G&A, fee) is required to build loaded rates."
                icon={<Percent className="h-7 w-7" strokeWidth={1.5} />}
              />
            )}
            {otherRs.length ? (
              <div className="border-t divide-y">
                {otherRs.map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">Effective <DateText d={r.effectiveDate} /></div>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </FadeIn>
  )
}

/* ----------------------------- model workspace ----------------------------- */

function ModelWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const go = useBidStore((s) => s.go)
  const { data, isLoading } = useQuery<ModelDetail>({
    queryKey: ['pricing', id],
    queryFn: async () => (await fetch(`/api/pricing?id=${encodeURIComponent(id)}`)).json(),
  })
  const { data: list } = useQuery<PricingListData>({
    queryKey: ['pricing'],
    queryFn: async () => (await fetch('/api/pricing')).json(),
  })

  if (isLoading) {
    return (
      <FadeIn>
        <Skeleton className="h-7 w-36 mb-2" />
        <Skeleton className="h-7 w-96 mb-1.5" />
        <Skeleton className="h-4 w-72 mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-9 w-full max-w-2xl mb-3" />
        <Skeleton className="h-96" />
      </FadeIn>
    )
  }

  if (!data?.engine || !data.model) {
    return (
      <FadeIn>
        <Button variant="ghost" size="sm" className="h-7 -ml-2 mb-3 text-[12px] text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />All pricing
        </Button>
        <EmptyState
          title="Pricing model not found"
          hint="This model may have been removed. Open the pricing list to pick another."
          icon={<Calculator className="h-7 w-7" strokeWidth={1.5} />}
        />
      </FadeIn>
    )
  }

  const engine = data.engine
  const model = data.model
  const proposalTitle = list?.models.find((m) => m.id === id)?.proposalTitle ?? ''
  const feeCents = engine.grandTotal.priceCents - engine.grandTotal.costCents
  const avgPrice = engine.periods.length ? Math.round(engine.grandTotal.priceCents / engine.periods.length) : engine.grandTotal.priceCents
  const rs = engine.rateSet

  return (
    <FadeIn k={id}>
      <div data-tour="pricing-model">
        {/* Header */}
        <div className="mb-4">
          <Button variant="ghost" size="sm" className="h-7 -ml-2 mb-1 text-[12px] text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />All pricing
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{model.name}</h1>
            <StatusPill status={model.status} />
            <Pill tone="muted">{model.contractType}</Pill>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {proposalTitle && model.proposalId ? (
              <>
                <button
                  className="underline decoration-border underline-offset-2 hover:text-foreground focus-ring rounded"
                  onClick={() => go('proposals', { id: model.proposalId as string })}
                >
                  {proposalTitle}
                </button>
                <span aria-hidden> · </span>
              </>
            ) : null}
            {rs.name} ({rs.source}) · effective <DateText d={rs.effectiveDate} />
          </p>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard label="Total price" value={<Money cents={engine.grandTotal.priceCents} />} sub={`${engine.periods.length} periods · ${fmtBps(engine.escalationBps)} escalation`} tone="brand" />
          <StatCard label="Total cost" value={<Money cents={engine.grandTotal.costCents} />} sub="Labor + ODC, before fee" />
          <StatCard label="Fee amount" value={<Money cents={feeCents} />} sub={`Fee at ${fmtBps(rs.feeBps)} on total cost`} />
          <StatCard label="Avg price per period" value={<Money cents={avgPrice} />} sub="Total price spread across periods" />
        </div>

        <Tabs defaultValue="rates" className="gap-3">
          <TabsList className="flex-wrap h-auto gap-0.5">
            <TabsTrigger value="rates" className="flex-none h-8 px-2.5 text-[12px]">Rates &amp; Loaded Build-up</TabsTrigger>
            <TabsTrigger value="hours" className="flex-none h-8 px-2.5 text-[12px]">Hours &amp; Periods</TabsTrigger>
            <TabsTrigger value="clins" className="flex-none h-8 px-2.5 text-[12px]">CLIN Totals</TabsTrigger>
            <TabsTrigger value="benchmarks" className="flex-none h-8 px-2.5 text-[12px]">Benchmarks</TabsTrigger>
            <TabsTrigger value="sensitivity" className="flex-none h-8 px-2.5 text-[12px]">Sensitivity</TabsTrigger>
          </TabsList>

          <TabsContent value="rates" forceMount className="data-[state=inactive]:hidden">
            <RatesTab key={`r-${rs.fringeBps}-${rs.overheadBps}-${rs.gaBps}-${rs.feeBps}`} id={id} engine={engine} />
          </TabsContent>
          <TabsContent value="hours" forceMount className="data-[state=inactive]:hidden">
            <HoursTab key={`h-${hoursSignature(engine.hours)}-e${engine.escalationBps}`} id={id} engine={engine} />
          </TabsContent>
          <TabsContent value="clins" forceMount className="data-[state=inactive]:hidden">
            <ClinTab id={id} engine={engine} />
          </TabsContent>
          <TabsContent value="benchmarks" forceMount className="data-[state=inactive]:hidden">
            <BenchmarksTab engine={engine} />
          </TabsContent>
          <TabsContent value="sensitivity" forceMount className="data-[state=inactive]:hidden">
            <SensitivityTab engine={engine} scenarios={data.scenarios} />
          </TabsContent>
        </Tabs>
      </div>
    </FadeIn>
  )
}

/* ------------------------------- tab: rates -------------------------------- */

function RatesTab({ id, engine }: { id: string; engine: Engine }) {
  const patch = usePricingPatch(id)
  const rs = engine.rateSet
  const [fields, setFields] = useState({
    fringe: String(rs.fringeBps / 100),
    overhead: String(rs.overheadBps / 100),
    ga: String(rs.gaBps / 100),
    fee: String(rs.feeBps / 100),
  })

  const apply = () => {
    patch.mutate(
      {
        rates: {
          fringeBps: parsePercentToBps(fields.fringe, rs.fringeBps),
          overheadBps: parsePercentToBps(fields.overhead, rs.overheadBps),
          gaBps: parsePercentToBps(fields.ga, rs.gaBps),
          feeBps: parsePercentToBps(fields.fee, rs.feeBps),
        },
      },
      {
        onSuccess: () => toast({
          title: 'Rates applied — all totals recomputed',
          description: 'Loaded rates, CLIN totals, benchmarks, and sensitivity scenarios updated.',
        }),
      },
    )
  }

  const loadedRows = engine.loadedRates.map((l) => ({ ...l, id: l.lcatId }))
  const loadedColumns: Column<LoadedRate & { id: string }>[] = [
    { key: 'lcat', header: 'Labor category', sortValue: (r) => r.lcatTitle, render: (r) => <span className="font-medium whitespace-nowrap">{r.lcatTitle}</span> },
    { key: 'base', header: 'Base rate', className: 'text-right tnum', sortValue: (r) => r.baseRateCents, render: (r) => fmtRate(r.baseRateCents) },
    { key: 'fringe', header: 'Fringe', className: 'text-right tnum', sortValue: (r) => r.fringe, render: (r) => fmtRate(r.fringe) },
    { key: 'oh', header: 'Overhead', className: 'text-right tnum', sortValue: (r) => r.overhead, render: (r) => fmtRate(r.overhead) },
    { key: 'cost', header: 'Cost', className: 'text-right tnum', sortValue: (r) => r.cost, render: (r) => fmtRate(r.cost) },
    { key: 'ga', header: 'G&A', className: 'text-right tnum', sortValue: (r) => r.ga, render: (r) => fmtRate(r.ga) },
    { key: 'tcost', header: 'Total cost', className: 'text-right tnum', sortValue: (r) => r.totalCost, render: (r) => fmtRate(r.totalCost) },
    { key: 'fee', header: 'Fee', className: 'text-right tnum', sortValue: (r) => r.fee, render: (r) => fmtRate(r.fee) },
    { key: 'price', header: 'Price', className: 'text-right tnum font-semibold', sortValue: (r) => r.price, render: (r) => fmtRate(r.price) },
    {
      key: 'bench', header: 'Benchmark', sortValue: (r) => r.price,
      render: (r) => <BenchmarkMini low={r.benchmarkLowCents} high={r.benchmarkHighCents} value={r.price} />,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Indirect rates */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Sigma className="h-4 w-4 text-muted-foreground" />Indirect rates
          </h3>
          <Pill tone="muted">{rs.name}</Pill>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <RateField id="rate-fringe" label="Fringe" hint="Applied on base labor" value={fields.fringe}
              onChange={(v) => setFields((f) => ({ ...f, fringe: v }))} disabled={patch.isPending} />
            <RateField id="rate-overhead" label="Overhead" hint="Applied on base + fringe" value={fields.overhead}
              onChange={(v) => setFields((f) => ({ ...f, overhead: v }))} disabled={patch.isPending} />
            <RateField id="rate-ga" label="G&A" hint="Applied on cost" value={fields.ga}
              onChange={(v) => setFields((f) => ({ ...f, ga: v }))} disabled={patch.isPending} />
            <RateField id="rate-fee" label="Fee" hint="Applied on total cost" value={fields.fee}
              onChange={(v) => setFields((f) => ({ ...f, fee: v }))} disabled={patch.isPending} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-[11.5px] text-muted-foreground">
              Edits apply to the active rate set ({rs.source}); every model using it recomputes.
            </p>
            <Button size="sm" onClick={apply} disabled={patch.isPending}>Apply rates</Button>
          </div>
        </div>
      </div>

      {/* Build-up order */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h3 className="text-[13px] font-semibold">Build-up order</h3>
        </div>
        <div className="p-4">
          <BuildUpDiagram />
          <p className="text-[11px] text-muted-foreground mt-3">
            Fringe and overhead load on labor; G&amp;A applies to cost; fee is applied last to produce price. All arithmetic is integer-cent, rounded once per step.
          </p>
        </div>
      </div>

      {/* Loaded rates */}
      <div>
        <DataTable
          columns={loadedColumns}
          rows={loadedRows}
          csvName="loaded-rates"
          dense
          empty={<EmptyState title="No labor categories" hint="The active rate set has no labor categories to load." icon={<Sigma className="h-7 w-7" strokeWidth={1.5} />} />}
        />
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          Calculations support but do not replace accounting and contracts review.
        </p>
      </div>
    </div>
  )
}

function RateField({ id, label, hint, value, onChange, disabled }: {
  id: string; label: string; hint: string; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-[11.5px]">{label}</Label>
      <div className="relative mt-1.5">
        <Input id={id} type="number" min={0} step={0.1} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} className="pr-7 tnum" />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">%</span>
      </div>
      <p className="text-[10.5px] text-muted-foreground mt-1">{hint}</p>
    </div>
  )
}

function BuildUpDiagram() {
  const steps: { text: string; kind: 'base' | 'op' | 'result' | 'price' }[] = [
    { text: 'Base', kind: 'base' },
    { text: '+ Fringe (on base)', kind: 'op' },
    { text: '+ Overhead (on base + fringe)', kind: 'op' },
    { text: '= Cost', kind: 'result' },
    { text: '+ G&A (on cost)', kind: 'op' },
    { text: '= Total cost', kind: 'result' },
    { text: '+ Fee', kind: 'op' },
    { text: '= Price', kind: 'price' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {steps.map((s, i) => (
        <span key={s.text} className="flex items-center gap-1.5">
          {i > 0 ? <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden /> : null}
          <span className={cn(
            'rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap',
            s.kind === 'base' && 'bg-muted/60 text-foreground',
            s.kind === 'op' && 'bg-muted/40 text-muted-foreground',
            s.kind === 'result' && 'bg-accent text-accent-foreground font-medium',
            s.kind === 'price' && 'border-[var(--brand)] bg-accent text-[var(--brand)] font-semibold',
          )}>{s.text}</span>
        </span>
      ))}
    </div>
  )
}

/** Mini benchmark position bar: marker = loaded price vs CALC+ low–high range. */
function BenchmarkMini({ low, high, value }: { low: number; high: number; value: number }) {
  const inside = value >= low && value <= high
  const above = value > high
  const span = high - low
  const pos = span > 0 ? Math.min(100, Math.max(0, ((value - low) / span) * 100)) : 50
  const color = inside ? 'bg-[var(--success)]' : above ? 'bg-[var(--warning)]' : 'bg-[var(--info)]'
  return (
    <div className="flex items-center gap-2" title={`CALC+ range ${fmtRate(low)} – ${fmtRate(high)} · loaded price ${fmtRate(value)}`}>
      <div className="relative h-1.5 w-20 rounded-full bg-border/70">
        <div
          className={cn('absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-card', color)}
          style={{ left: `calc(${pos}% - 6px)` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{inside ? 'In range' : above ? 'Above' : 'Below'}</span>
    </div>
  )
}

/* --------------------------- tab: hours & periods --------------------------- */

function HoursTab({ id, engine }: { id: string; engine: Engine }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
      <div className="xl:col-span-2 space-y-4">
        <HoursGrid id={id} hours={engine.hours} periods={engine.periods} />
        <OdcCard odcLines={engine.odcLines} periods={engine.periods} />
      </div>
      <div className="space-y-4">
        <EscalationCard id={id} escalationBps={engine.escalationBps} />
        <PeriodsCard periods={engine.periods} />
      </div>
    </div>
  )
}

function HoursGrid({ id, hours, periods }: { id: string; hours: Engine['hours']; periods: PeriodDef[] }) {
  const patch = usePricingPatch(id)
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const h of hours) h.hours.forEach((v, p) => { init[`${h.lcatId}:${p}`] = String(v) })
    return init
  })

  const cellVal = (key: string): string => cells[key] ?? '0'
  const setCell = (key: string, v: string) => setCells((c) => ({ ...c, [key]: v }))

  const rowTotal = (lcatId: string): number =>
    hours.filter((h) => h.lcatId === lcatId).reduce((s, h) => s + h.hours.reduce((ss, _, p) => ss + parseInt0(cellVal(`${h.lcatId}:${p}`)), 0), 0)
  const colTotal = (p: number): number => hours.reduce((s, h) => s + parseInt0(cellVal(`${h.lcatId}:${p}`)), 0)
  const grandTotal = periods.reduce((s, _, p) => s + colTotal(p), 0)

  const apply = () => {
    const changed: { lcatId: string; periodIndex: number; hours: number }[] = []
    for (const h of hours) {
      h.hours.forEach((orig, p) => {
        const v = parseInt0(cellVal(`${h.lcatId}:${p}`))
        if (v !== orig) changed.push({ lcatId: h.lcatId, periodIndex: p, hours: v })
      })
    }
    if (!changed.length) {
      toast({ title: 'No changes to apply', description: 'Edit hours in the grid first.' })
      return
    }
    patch.mutate(
      { hours: changed },
      {
        onSuccess: () => toast({
          title: 'Hours updated — totals recomputed',
          description: `${changed.length} cell${changed.length === 1 ? '' : 's'} saved; loaded rates unchanged.`,
        }),
      },
    )
  }

  if (!hours.length) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" />Hours by labor category</h3>
        </div>
        <EmptyState title="No labor hours" hint="Labor categories with estimated hours appear here once the model has labor lines." icon={<Clock3 className="h-7 w-7" strokeWidth={1.5} />} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-muted-foreground" />Hours by labor category
        </h3>
        <Button size="sm" onClick={apply} disabled={patch.isPending}>Apply hours</Button>
      </div>
      <div className="overflow-auto scroll-thin">
        <table className="table-dense w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="min-w-44">Labor category</th>
              {periods.map((p) => (
                <th key={p.label} className="text-right whitespace-nowrap">{p.label}</th>
              ))}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h.lcatId}>
                <td className="font-medium whitespace-nowrap">{h.lcatTitle}</td>
                {h.hours.map((_, p) => (
                  <td key={p} className="text-right">
                    <Input
                      type="number" min={0} step={20}
                      className="h-7 w-24 ml-auto text-right tnum text-[12px]"
                      value={cellVal(`${h.lcatId}:${p}`)}
                      onChange={(e) => setCell(`${h.lcatId}:${p}`, e.target.value)}
                      aria-label={`${h.lcatTitle} hours, ${periods[p]?.label ?? `Period ${p}`}`}
                    />
                  </td>
                ))}
                <td className="text-right tnum font-semibold">{fmtHours(rowTotal(h.lcatId))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50">
              <td className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total hours</td>
              {periods.map((_, p) => (
                <td key={p} className="px-3 py-1.5 text-right tnum text-[13px] font-semibold">{fmtHours(colTotal(p))}</td>
              ))}
              <td className="px-3 py-1.5 text-right tnum text-[13px] font-semibold">{fmtHours(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function EscalationCard({ id, escalationBps }: { id: string; escalationBps: number }) {
  const patch = usePricingPatch(id)
  const [v, setV] = useState(String(escalationBps / 100))

  const commit = () => {
    const n = parseFloat(v)
    if (!Number.isFinite(n) || n < 0) {
      setV(String(escalationBps / 100))
      return
    }
    const bps = Math.round(n * 100)
    if (bps !== escalationBps) {
      patch.mutate(
        { escalationBps: bps },
        {
          onSuccess: () => toast({
            title: 'Escalation updated — totals recomputed',
            description: `Annual escalation set to ${fmtBps(bps)}.`,
          }),
        },
      )
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />Escalation
        </h3>
      </div>
      <div className="p-4">
        <Label htmlFor="esc-input" className="text-[11.5px]">Annual escalation (%)</Label>
        <Input
          id="esc-input" type="number" min={0} step={0.1} className="mt-1.5 tnum"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Compounded per period on total cost. Saved on commit (blur or Enter) and all totals recompute.
        </p>
      </div>
    </div>
  )
}

function PeriodsCard({ periods }: { periods: PeriodDef[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />Periods
        </h3>
        <Pill tone="muted">{periods.length} periods</Pill>
      </div>
      {periods.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No periods defined on this model.</div>
      ) : (
        <div className="divide-y">
          {periods.map((p) => (
            <div key={p.label} className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate">{p.label}</div>
                <div className="text-[11px] text-muted-foreground tnum">
                  <DateText d={p.startDate} /> – <DateText d={p.endDate} />
                </div>
              </div>
              <Pill tone="muted">{p.months} mo</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OdcCard({ odcLines, periods }: { odcLines: Engine['odcLines']; periods: PeriodDef[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />Other direct costs
        </h3>
        <Pill tone="muted">{odcLines.length} lines</Pill>
      </div>
      {odcLines.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No other direct costs in this model.</div>
      ) : (
        <div className="divide-y">
          {odcLines.map((o, i) => (
            <div key={`${o.title}-${i}`} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate">{o.title}</div>
                <div className="text-[11px] text-muted-foreground">{periods[o.periodIndex]?.label ?? `Period ${o.periodIndex + 1}`}</div>
              </div>
              <Money cents={o.unitCostCents} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ----------------------------- tab: CLIN totals ----------------------------- */

function ClinTab({ id, engine }: { id: string; engine: Engine }) {
  const pt = engine.periodTotals
  const laborSum = pt.reduce((s, p) => s + p.laborCostCents, 0)
  const odcSum = pt.reduce((s, p) => s + p.odcCents, 0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />Period totals and CLIN build-up
          </h3>
          <Pill tone="muted">{pt.length} periods</Pill>
        </div>
        <div className="overflow-auto scroll-thin">
          <table className="table-dense w-full min-w-[680px]">
            <thead>
              <tr>
                <th>Period</th>
                <th className="text-right">Labor</th>
                <th className="text-right">ODC</th>
                <th className="text-right">Total cost</th>
                <th className="text-right">Price</th>
                <th>CLIN</th>
              </tr>
            </thead>
            <tbody>
              {pt.map((p) => (
                <tr key={p.periodIndex}>
                  <td className="font-medium whitespace-nowrap">{p.label}</td>
                  <td className="text-right tnum"><Money cents={p.laborCostCents} /></td>
                  <td className="text-right tnum"><Money cents={p.odcCents} /></td>
                  <td className="text-right tnum"><Money cents={p.totalCostCents} /></td>
                  <td className="text-right tnum font-semibold"><Money cents={p.priceCents} /></td>
                  <td className="font-mono text-[12px] whitespace-nowrap">{p.clinRef}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/50">
                <td className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grand total</td>
                <td className="px-3 py-2 text-right tnum text-[13px] font-semibold"><Money cents={laborSum} /></td>
                <td className="px-3 py-2 text-right tnum text-[13px] font-semibold"><Money cents={odcSum} /></td>
                <td className="px-3 py-2 text-right tnum text-[13px] font-semibold"><Money cents={engine.grandTotal.costCents} /></td>
                <td className="px-3 py-2 text-right tnum text-[13px] font-semibold"><Money cents={engine.grandTotal.priceCents} /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {pt.length === 0 ? (
        <EmptyState title="No periods to price" hint="Add periods to the model before building CLIN totals." icon={<FileSpreadsheet className="h-7 w-7" strokeWidth={1.5} />} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <CostPriceChart periodTotals={pt} />
          <CarryCard id={id} engine={engine} />
        </div>
      )}
    </div>
  )
}

/** Stacked bar per period: total height = price, lower band = cost, upper band = fee. */
function CostPriceChart({ periodTotals }: { periodTotals: PeriodTotal[] }) {
  const max = Math.max(...periodTotals.map((p) => p.priceCents), 1)
  const cols = { gridTemplateColumns: `repeat(${periodTotals.length}, minmax(0, 1fr))` }
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Cost vs price by period</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} />Cost
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} />Fee
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="grid items-end gap-3 h-48" style={cols}>
          {periodTotals.map((p) => {
            const hPct = (p.priceCents / max) * 100
            const costPct = p.priceCents > 0 ? (p.totalCostCents / p.priceCents) * 100 : 0
            return (
              <div key={p.periodIndex} className="flex h-full flex-col items-center gap-1 min-w-0">
                <span className="tnum text-[10.5px] text-muted-foreground whitespace-nowrap">{fmtMoneyCompact(p.priceCents)}</span>
                <div className="flex-1 min-h-0 w-full max-w-14 flex flex-col justify-end">
                  <div
                    className="flex w-full flex-col"
                    style={{ height: `${hPct}%` }}
                    role="img"
                    aria-label={`${p.label}: price ${fmtMoney(p.priceCents)}, cost ${fmtMoney(p.totalCostCents)}`}
                  >
                    <div className="w-full rounded-t-sm" style={{ height: `${100 - costPct}%`, background: 'var(--chart-1)' }} />
                    <div className="w-full" style={{ height: `${costPct}%`, background: 'var(--chart-2)' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="grid gap-3 mt-2" style={cols}>
          {periodTotals.map((p) => (
            <div key={p.periodIndex} className="text-[10px] text-muted-foreground text-center truncate">{p.label}</div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Bars show total price per period; the navy portion is cost (labor + ODC) and the blue portion is fee.
        </p>
      </div>
    </div>
  )
}

function CarryCard({ id, engine }: { id: string; engine: Engine }) {
  const qc = useQueryClient()
  const go = useBidStore((s) => s.go)
  const { data: contractsData } = useQuery<{ contracts: ContractLite[] }>({
    queryKey: ['contracts'],
    queryFn: async () => (await fetch('/api/contracts')).json(),
  })
  const [contractId, setContractId] = useState('')
  const [carried, setCarried] = useState<{ count: number; contractId: string; number: string } | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createContractClins', id, contractId }),
      })
      if (!res.ok) throw new Error('Failed')
      return (await res.json()) as { ok: boolean; clinCount: number; totalCents: number }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contract'] })
      const num = contractsData?.contracts.find((c) => c.id === contractId)?.number ?? 'the contract'
      setCarried({ count: d.clinCount, contractId, number: num })
      toast({
        title: `${d.clinCount} CLINs carried to contract ${num}`,
        description: `Funding set to base period — contract ceiling updated to ${fmtMoney(d.totalCents)}.`,
      })
    },
    onError: () => toast({ title: 'Could not create CLINs', description: 'Try again in a moment.', variant: 'destructive' }),
  })

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-semibold">Carry CLINs to contract</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-muted-foreground leading-5">
          Creates {engine.clins.length} CLINs worth <Money cents={engine.grandTotal.priceCents} /> on the selected
          contract, replaces its manually entered CLINs, and funds the base period.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={contractId} onValueChange={(v) => { setContractId(v); setCarried(null) }}>
            <SelectTrigger size="sm" className="w-64" aria-label="Target contract">
              <SelectValue placeholder="Select a contract…" />
            </SelectTrigger>
            <SelectContent>
              {(contractsData?.contracts ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.number} — {c.agency}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!contractId || create.isPending} onClick={() => create.mutate()}>
            Create contract CLINs
          </Button>
          {carried ? (
            <Button variant="outline" size="sm" onClick={() => go('contracts', { id: carried.contractId })}>
              Go to contract <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        {carried ? (
          <p className="text-[11.5px] text-[var(--success)]">
            {carried.count} CLINs created on {carried.number} — funding set to base period.
          </p>
        ) : null}
        {(contractsData?.contracts.length ?? 0) === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            No contracts yet — mark a pursuit as won to create a contract shell first.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/* ----------------------------- tab: benchmarks ------------------------------ */

function BenchmarksTab({ engine }: { engine: Engine }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />Loaded price vs CALC+ benchmark range
        </h3>
        <Pill tone="muted">{engine.loadedRates.length} labor categories</Pill>
      </div>
      {engine.loadedRates.length === 0 ? (
        <EmptyState
          title="No labor categories to benchmark"
          hint="The active rate set has no labor categories."
          icon={<BarChart3 className="h-7 w-7" strokeWidth={1.5} />}
        />
      ) : (
        <div className="p-4 grid md:grid-cols-2 gap-x-8 gap-y-5">
          {engine.loadedRates.map((l) => (
            <BenchmarkRow key={l.lcatId} title={l.lcatTitle} price={l.price} low={l.benchmarkLowCents} high={l.benchmarkHighCents} />
          ))}
        </div>
      )}
      <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        Benchmark ranges: GSA CALC+ snapshot cached at configuration time (sample data in the demonstration workspace).
      </div>
    </div>
  )
}

function BenchmarkRow({ title, price, low, high }: { title: string; price: number; low: number; high: number }) {
  const inside = price >= low && price <= high
  const below = price < low
  const color = inside ? 'var(--success)' : below ? 'var(--info)' : 'var(--warning)'
  // Expand the domain so the marker stays visible even when the price sits outside the range.
  const lo = Math.min(low, price)
  const hi = Math.max(high, price)
  const pad = (hi - lo) * 0.08 || 1
  const dLo = lo - pad
  const dHi = hi + pad
  const pos = (v: number): number => (dHi > dLo ? ((v - dLo) / (dHi - dLo)) * 100 : 50)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[13px] font-medium truncate">{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          <Pill tone={inside ? 'success' : below ? 'info' : 'warning'}>
            {inside ? 'Within range' : below ? 'Below range' : 'Above range'}
          </Pill>
          <span className="tnum text-[13px] font-semibold flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
            {fmtRate(price)}
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: `${pos(low)}%`, width: `${Math.max(0, pos(high) - pos(low))}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full"
          style={{ left: `calc(${pos(price)}% - 2px)`, background: color }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10.5px] tnum text-muted-foreground">
        <span>Low {fmtRate(low)}</span>
        <span>High {fmtRate(high)}</span>
      </div>
    </div>
  )
}

/* ----------------------------- tab: sensitivity ----------------------------- */

type SensitivityRow = { id: string; label: string; priceCents: number; delta: number }

function SensitivityTab({ engine, scenarios }: { engine: Engine; scenarios: ModelDetail['scenarios'] }) {
  const base = engine.grandTotal.priceCents
  const defs = [
    { id: 'feeMinus', label: 'Fee \u22122 points', s: scenarios.feeMinus },
    { id: 'feePlus', label: 'Fee +2 points', s: scenarios.feePlus },
    { id: 'escMinus', label: 'Escalation \u22121 point', s: scenarios.escMinus },
    { id: 'escPlus', label: 'Escalation +1 point', s: scenarios.escPlus },
    { id: 'hoursMinus', label: 'Hours \u221210%', s: scenarios.hoursMinus },
    { id: 'hoursPlus', label: 'Hours +10%', s: scenarios.hoursPlus },
  ]
  const rows: SensitivityRow[] = defs.map((d) => ({
    id: d.id, label: d.label, priceCents: d.s.grandTotal.priceCents, delta: d.s.grandTotal.priceCents - base,
  }))
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.delta)), 1)
  const feeDelta = rows.find((r) => r.id === 'feeMinus')?.delta ?? 0

  const columns: Column<SensitivityRow>[] = [
    { key: 'label', header: 'Scenario', sortValue: (r) => r.label, render: (r) => <span className="font-medium">{r.label}</span> },
    { key: 'price', header: 'Total price', className: 'text-right tnum', sortValue: (r) => r.priceCents, render: (r) => <Money cents={r.priceCents} /> },
    {
      key: 'delta', header: 'Δ vs base', className: 'text-right', sortValue: (r) => r.delta,
      render: (r) => (
        <span className="tnum">
          <span className="font-medium">{signedMoney(r.delta)}</span>{' '}
          <span className="text-muted-foreground">({signedPct(r.delta, base)})</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable columns={columns} rows={rows} csvName="sensitivity" dense />

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />Δ total price vs base plan
          </h3>
          <span className="text-[11.5px] text-muted-foreground">Base plan: <Money cents={base} className="font-medium text-foreground" /></span>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => {
            const w = (Math.abs(r.delta) / maxAbs) * 50
            return (
              <div key={r.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[12px] text-muted-foreground truncate">{r.label}</span>
                <div className="relative flex-1 h-3.5 min-w-0">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  {r.delta >= 0 ? (
                    <div className="absolute inset-y-0.5 left-1/2 rounded-r-full" style={{ width: `${w}%`, background: 'var(--success)' }} />
                  ) : (
                    <div className="absolute inset-y-0.5 rounded-l-full" style={{ right: '50%', width: `${w}%`, background: 'var(--danger)' }} />
                  )}
                </div>
                <span className="w-24 shrink-0 text-right tnum text-[11.5px] font-medium">{signedMoney(r.delta)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground">
        A two-point fee reduction moves total price by{' '}
        <span className="font-semibold text-foreground tnum">{signedMoney(feeDelta)}</span> ({signedPct(feeDelta, base)}).
      </p>
    </div>
  )
}
