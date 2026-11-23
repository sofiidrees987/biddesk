'use client'

import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBidStore } from '@/lib/biddesk/store'
import {
  SectionHeader, StatCard, Pill, StatusPill, EmptyState, DataTable, FadeIn, Money, DateText, FilterInput, KV,
  type Column, type PillTone,
} from '@/components/biddesk/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtRelative, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  ArrowLeft, FolderKanban, Plus, LibraryBig, Receipt, Users, Wallet, CheckCircle2,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type ContractRow = {
  id: string; number: string; agency: string; type: string; vehicle: string; status: string
  startDate: string; endDate: string; popLabel: string
  ceilingCents: number; obligatedCents: number; fundedCents: number
  deliverableIssues: number; optionPending: boolean
}

type Clin = { id: string; ref: string; name: string; type: string; periodLabel: string; valueCents: number; fundedCents: number }

type Deliverable = {
  id: string; title: string; didRef: string; frequency: string
  nextDue: string | null; status: string; lastSubmitted: string | null; recipients: string
}

type Modification = { id: string; number: string; type: string; effectiveDate: string; valueDeltaCents: number; description: string }

type OptionPeriodRow = {
  id: string; label: string; exerciseBy: string | null; preliminaryNoticeBy: string | null
  exercised: boolean; exercisedAt: string | null; modNumber: string
}

type Cpars = {
  id: string; periodLabel: string; status: string; overallRating: string
  ratings: { factor: string; rating: string }[]
  narrative: string; responseDue: string | null; contractorComment: string
}

type Invoice = { id: string; reference: string; period: string; amountCents: number; status: string }
type Subcontractor = { id: string; name: string; valueCents: number; smallBusiness: boolean }
type CloseoutItem = { label: string; done: boolean }

type Contract = {
  id: string; number: string; vehicle: string; type: string; agency: string
  coName: string; corName: string; status: string
  awardDate: string; startDate: string; endDate: string; popLabel: string
  ceilingCents: number; obligatedCents: number; fundedCents: number
  closeout: CloseoutItem[]; pastPerformanceAdded: boolean
  pursuit: { id: string; title: string } | null
  clins: Clin[]; deliverables: Deliverable[]; modifications: Modification[]
  options: OptionPeriodRow[]; cpars: Cpars[]; invoices: Invoice[]; subcontractors: Subcontractor[]
}

type ContractActionResponse = {
  ok?: boolean
  modification?: { id: string; number: string; type: string; valueDeltaCents: number }
  modNumber?: string
  pastPerformanceId?: string
}

/* ------------------------------ shared pieces ------------------------------- */

const MOD_TONE: Record<string, PillTone> = {
  funding: 'info', scope: 'warning', option_exercise: 'success',
  pop_extension: 'muted', administrative: 'muted', other: 'muted',
}

const CPARS_TONE: Record<string, PillTone> = {
  Exceptional: 'success', 'Very Good': 'success', Satisfactory: 'info',
  Marginal: 'warning', Unsatisfactory: 'danger',
}

/** POST /api/contracts — every action invalidates the detail and the portfolio list. */
function useContractAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<ContractActionResponse> => {
      const res = await fetch('/api/contracts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
      })
      if (!res.ok) throw new Error('Request failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract', id] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: () => toast({ title: 'Action failed', description: 'Try again in a moment.', variant: 'destructive' }),
  })
}

type ContractAction = ReturnType<typeof useContractAction>

/* ------------------------------- section root ------------------------------- */

export function ContractsSection() {
  const id = useBidStore((s) => s.params.contracts?.id)
  if (id) return <ContractDetail id={id} />
  return <ContractsList />
}

/* -------------------------------- list state -------------------------------- */

function ContractsList() {
  const go = useBidStore((s) => s.go)
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery<{ contracts: ContractRow[] }>({
    queryKey: ['contracts'],
    queryFn: async () => (await fetch('/api/contracts')).json(),
  })

  if (isLoading || !data) {
    return (
      <FadeIn>
        <SectionHeader title="Contracts" description="Post-award administration: CLINs, funding, deliverables, modifications, options, and CPARS." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </FadeIn>
    )
  }

  const needle = q.trim().toLowerCase()
  const rows = data.contracts.filter((c) =>
    `${c.number} ${c.agency} ${c.vehicle} ${c.popLabel} ${c.type}`.toLowerCase().includes(needle))

  const activeCount = data.contracts.filter((c) => c.status === 'active').length
  const portfolioCents = data.contracts.reduce((s, c) => s + c.ceilingCents, 0)
  const backlogCents = data.contracts.reduce((s, c) => s + Math.max(0, c.ceilingCents - c.obligatedCents), 0)
  const fundedCents = data.contracts.reduce((s, c) => s + c.fundedCents, 0)

  const columns: Column<ContractRow>[] = [
    {
      key: 'number', header: 'Number', sortValue: (c) => c.number,
      render: (c) => <span className="font-mono text-[13px] font-semibold whitespace-nowrap">{c.number}</span>,
    },
    { key: 'agency', header: 'Agency', sortValue: (c) => c.agency, render: (c) => <span className="text-[12.5px]">{c.agency}</span> },
    { key: 'type', header: 'Type', sortValue: (c) => c.type, render: (c) => titleCase(c.type) },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <StatusPill status={c.status} /> },
    {
      key: 'end', header: 'End date', sortValue: (c) => c.endDate,
      render: (c) => {
        const rel = fmtRelative(c.endDate)
        return (
          <div className="whitespace-nowrap">
            <DateText d={c.endDate} />
            <div className="text-[11px] text-muted-foreground">{rel.text}</div>
          </div>
        )
      },
    },
    { key: 'ceiling', header: 'Ceiling', className: 'text-right tnum', sortValue: (c) => c.ceilingCents, render: (c) => <Money cents={c.ceilingCents} /> },
    {
      key: 'obligated', header: 'Obligated %',
      sortValue: (c) => (c.ceilingCents ? c.obligatedCents / c.ceilingCents : 0),
      render: (c) => {
        if (!c.ceilingCents) return <span className="text-muted-foreground">—</span>
        const p = Math.round((c.obligatedCents / c.ceilingCents) * 100)
        return (
          <div className="min-w-28">
            <div className="tnum text-[12px]">{p}%</div>
            <div className="mt-1 h-1 w-20 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', p >= 85 ? 'bg-[var(--danger)]' : p >= 50 ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')}
                style={{ width: `${Math.min(100, p)}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      key: 'alerts', header: 'Alerts',
      sortValue: (c) => (c.deliverableIssues > 0 ? `a${c.deliverableIssues}` : c.optionPending ? 'b' : 'c'),
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.deliverableIssues > 0 ? <Pill tone="danger">{c.deliverableIssues} late</Pill> : null}
          {c.optionPending ? <Pill tone="warning">Option window</Pill> : null}
          {!c.deliverableIssues && !c.optionPending ? <span className="text-muted-foreground">—</span> : null}
        </div>
      ),
    },
  ]

  return (
    <FadeIn>
      <div data-tour="contracts-list">
        <SectionHeader
          title="Contracts"
          description="Post-award administration: CLINs, funding, deliverables, modifications, options, and CPARS."
          actions={<FilterInput value={q} onChange={setQ} placeholder="Search contracts…" />}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard label="Active contracts" value={activeCount} sub={`${data.contracts.length} in portfolio`} />
          <StatCard label="Portfolio value" value={<Money cents={portfolioCents} />} sub="Sum of ceilings" />
          <StatCard label="Backlog" value={<Money cents={backlogCents} />} sub="Ceiling less obligated" />
          <StatCard label="Funded" value={<Money cents={fundedCents} />} sub="Funded to date" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          csvName="contracts"
          onRowClick={(c) => go('contracts', { id: c.id })}
          empty={
            <EmptyState
              title="No contracts yet"
              hint="Contracts appear when a pursuit is marked won — pricing models can then carry CLINs onto them."
              icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
            />
          }
        />
      </div>
    </FadeIn>
  )
}

/* ------------------------------ contract detail ----------------------------- */

function ContractDetail({ id }: { id: string }) {
  const go = useBidStore((s) => s.go)
  const action = useContractAction(id)
  const { data, isLoading } = useQuery<{ contract: Contract }>({
    queryKey: ['contract', id],
    queryFn: async () => (await fetch(`/api/contracts?id=${encodeURIComponent(id)}`)).json(),
  })

  if (isLoading) {
    return (
      <FadeIn>
        <Skeleton className="h-7 w-36 mb-2" />
        <Skeleton className="h-8 w-72 mb-1.5" />
        <Skeleton className="h-4 w-96 mb-4" />
        <Skeleton className="h-16 w-full mb-4" />
        <Skeleton className="h-9 w-full max-w-2xl mb-3" />
        <Skeleton className="h-80" />
      </FadeIn>
    )
  }

  if (!data?.contract) {
    return (
      <FadeIn>
        <Button variant="ghost" size="sm" className="h-7 -ml-2 mb-3 text-[12px] text-muted-foreground" onClick={() => go('contracts', {})}>
          <ArrowLeft className="h-3.5 w-3.5" />All contracts
        </Button>
        <EmptyState
          title="Contract not found"
          hint="This contract may have been removed. Open the portfolio to pick another."
          icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
        />
      </FadeIn>
    )
  }

  const c = data.contract

  return (
    <FadeIn k={id}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="h-7 -ml-2 mb-1 text-[12px] text-muted-foreground" onClick={() => go('contracts', {})}>
          <ArrowLeft className="h-3.5 w-3.5" />All contracts
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold tracking-tight">{c.number}</h1>
          <StatusPill status={c.status} />
          <Pill tone="muted">{c.vehicle}</Pill>
          <Pill tone="muted">{c.popLabel}</Pill>
        </div>
        <p className="text-[13px] text-muted-foreground mt-0.5">{c.agency} · {titleCase(c.type)}</p>

        <div className="mt-3 rounded-lg border bg-card px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-2.5">
          <KVStripItem label="Contracting officer" value={c.coName} />
          <KVStripItem label="COR" value={c.corName} />
          <KVStripItem label="Awarded" value={<DateText d={c.awardDate} />} />
          <KVStripItem label="Start" value={<DateText d={c.startDate} />} />
          <KVStripItem
            label="End"
            value={
              <>
                <DateText d={c.endDate} /> <span className="text-muted-foreground">({fmtRelative(c.endDate).text.toLowerCase()})</span>
              </>
            }
          />
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-3">
        <TabsList className="flex-wrap h-auto gap-0.5">
          <TabsTrigger value="overview" className="flex-none h-8 px-2.5 text-[12px]">Overview</TabsTrigger>
          <TabsTrigger value="clins" className="flex-none h-8 px-2.5 text-[12px]">CLINs &amp; Funding</TabsTrigger>
          <TabsTrigger value="deliverables" className="flex-none h-8 px-2.5 text-[12px]">Deliverables</TabsTrigger>
          <TabsTrigger value="modifications" className="flex-none h-8 px-2.5 text-[12px]">Modifications</TabsTrigger>
          <TabsTrigger value="options" className="flex-none h-8 px-2.5 text-[12px]">Options</TabsTrigger>
          <TabsTrigger value="cpars" className="flex-none h-8 px-2.5 text-[12px]">CPARS</TabsTrigger>
          <TabsTrigger value="closeout" className="flex-none h-8 px-2.5 text-[12px]">Closeout</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
          <OverviewTab contract={c} action={action} />
        </TabsContent>
        <TabsContent value="clins" forceMount className="data-[state=inactive]:hidden">
          <ClinsTab contract={c} />
        </TabsContent>
        <TabsContent value="deliverables" forceMount className="data-[state=inactive]:hidden">
          <DeliverablesTab contract={c} action={action} />
        </TabsContent>
        <TabsContent value="modifications" forceMount className="data-[state=inactive]:hidden">
          <ModificationsTab contract={c} action={action} />
        </TabsContent>
        <TabsContent value="options" forceMount className="data-[state=inactive]:hidden">
          <OptionsTab contract={c} action={action} />
        </TabsContent>
        <TabsContent value="cpars" forceMount className="data-[state=inactive]:hidden">
          <CparsTab contract={c} action={action} />
        </TabsContent>
        <TabsContent value="closeout" forceMount className="data-[state=inactive]:hidden">
          <CloseoutTab contract={c} action={action} />
        </TabsContent>
      </Tabs>
    </FadeIn>
  )
}

function KVStripItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[12.5px] font-medium truncate mt-0.5">{value}</div>
    </div>
  )
}

/* --------------------------------- overview --------------------------------- */

function OverviewTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  const go = useBidStore((s) => s.go)
  const ceiling = contract.ceilingCents
  const seg1 = Math.max(0, Math.min(contract.fundedCents, ceiling))
  const seg2 = Math.max(0, Math.min(contract.obligatedCents - contract.fundedCents, ceiling - seg1))
  const seg3 = Math.max(0, ceiling - seg1 - seg2)
  const pctObligated = ceiling > 0 ? Math.round((contract.obligatedCents / ceiling) * 100) : 0
  const subTotal = contract.subcontractors.reduce((s, x) => s + x.valueCents, 0)

  const invoiceColumns: Column<Invoice>[] = [
    { key: 'ref', header: 'Reference', sortValue: (i) => i.reference, render: (i) => <span className="font-mono text-[12.5px] font-medium">{i.reference}</span> },
    { key: 'period', header: 'Period', sortValue: (i) => i.period, render: (i) => <span className="text-[12.5px] text-muted-foreground">{i.period}</span> },
    { key: 'amount', header: 'Amount', className: 'text-right tnum', sortValue: (i) => i.amountCents, render: (i) => <Money cents={i.amountCents} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusPill status={i.status} /> },
  ]

  return (
    <div className="space-y-4">
      {/* Funding and obligation */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />Funding and obligation
          </h3>
          <Pill tone="muted">{contract.popLabel}</Pill>
        </div>
        <div className="p-4">
          {ceiling > 0 ? (
            <>
              <div
                className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`Funded ${fmtMoney(seg1)}, obligated not funded ${fmtMoney(seg2)}, unobligated ceiling ${fmtMoney(seg3)}`}
              >
                {seg1 > 0 ? <div className="h-full" style={{ width: `${(seg1 / ceiling) * 100}%`, background: 'var(--success)' }} /> : null}
                {seg2 > 0 ? <div className="h-full" style={{ width: `${(seg2 / ceiling) * 100}%`, background: 'var(--info)' }} /> : null}
                {seg3 > 0 ? <div className="h-full bg-muted-foreground/30" style={{ width: `${(seg3 / ceiling) * 100}%` }} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--success)' }} />Funded <Money cents={seg1} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--info)' }} />Obligated, not funded <Money cents={seg2} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />Unobligated ceiling <Money cents={seg3} />
                </span>
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No ceiling recorded on this contract.</p>
          )}
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <KV label="Ceiling"><Money cents={contract.ceilingCents} /></KV>
            <KV label="Obligated"><Money cents={contract.obligatedCents} /></KV>
            <KV label="Funded"><Money cents={contract.fundedCents} /></KV>
            <KV label="Obligated vs ceiling">{ceiling > 0 ? `${pctObligated}%` : '—'}</KV>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Invoices */}
        <div>
          <h3 className="text-[13px] font-semibold flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />Invoices
          </h3>
          <DataTable
            columns={invoiceColumns}
            rows={contract.invoices}
            csvName="invoices"
            dense
            empty={<EmptyState title="No invoices recorded" hint="Submitted invoices and their payment status appear here." icon={<Receipt className="h-7 w-7" strokeWidth={1.5} />} />}
          />
        </div>

        {/* Subcontractors */}
        <div>
          <h3 className="text-[13px] font-semibold flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-muted-foreground" />Subcontractors
          </h3>
          <div className="rounded-lg border bg-card overflow-hidden">
            {contract.subcontractors.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                No subcontractors recorded on this contract.
              </div>
            ) : (
              <div className="divide-y">
                {contract.subcontractors.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12.5px] font-medium truncate">{s.name}</span>
                      {s.smallBusiness ? <Pill tone="info">Small business</Pill> : null}
                    </div>
                    <Money cents={s.valueCents} />
                  </div>
                ))}
                <div className="px-4 py-2.5 flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Total subaward value</span>
                  <span className="tnum font-semibold"><Money cents={subTotal} /></span>
                </div>
              </div>
            )}
            <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
              Values as recorded at award; small business status per SAM.
            </div>
          </div>
        </div>
      </div>

      {/* Past performance */}
      {contract.pastPerformanceAdded ? (
        <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium">Past performance record in Library</div>
              <div className="text-[11.5px] text-muted-foreground">
                Created from this contract — review and approve before use in proposals.
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => go('library')}>Open Library</Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Past performance</div>
            <div className="text-[11.5px] text-muted-foreground">
              Generate a draft past performance record from this contract for the Library.
            </div>
          </div>
          <Button
            size="sm"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ action: 'addToLibrary' }, {
                onSuccess: () => toast({
                  title: 'Draft past performance created in Library',
                  description: 'Review and approve before use in proposals.',
                }),
              })
            }
          >
            <LibraryBig className="h-3.5 w-3.5" />Add to Library as past performance
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ CLINs & funding ------------------------------ */

function ClinsTab({ contract }: { contract: Contract }) {
  const totalValue = contract.clins.reduce((s, cl) => s + cl.valueCents, 0)
  const totalFunded = contract.clins.reduce((s, cl) => s + cl.fundedCents, 0)
  const pctFunded = totalValue > 0 ? Math.round((totalFunded / totalValue) * 100) : 0

  const columns: Column<Clin>[] = [
    { key: 'ref', header: 'Ref', sortValue: (cl) => cl.ref, render: (cl) => <span className="font-mono text-[12.5px] font-semibold">{cl.ref}</span> },
    { key: 'name', header: 'Name', sortValue: (cl) => cl.name, render: (cl) => <span className="text-[12.5px]">{cl.name}</span> },
    { key: 'type', header: 'Type', sortValue: (cl) => cl.type, render: (cl) => <Pill tone="muted">{titleCase(cl.type)}</Pill> },
    { key: 'period', header: 'Period', sortValue: (cl) => cl.periodLabel, render: (cl) => <span className="text-[12.5px] text-muted-foreground">{cl.periodLabel}</span> },
    { key: 'value', header: 'Value', className: 'text-right tnum', sortValue: (cl) => cl.valueCents, render: (cl) => <Money cents={cl.valueCents} /> },
    {
      key: 'funded', header: 'Funded', className: 'text-right', sortValue: (cl) => (cl.valueCents ? cl.fundedCents / cl.valueCents : 0),
      render: (cl) => {
        if (!cl.valueCents) return <span className="text-muted-foreground">—</span>
        const p = Math.round((cl.fundedCents / cl.valueCents) * 100)
        return (
          <div className="inline-block min-w-28 text-right">
            <div className="tnum text-[12.5px]"><Money cents={cl.fundedCents} /></div>
            <div className="mt-1 h-1 w-20 rounded-full bg-muted overflow-hidden ml-auto">
              <div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${Math.min(100, p)}%` }} />
            </div>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <DataTable
        columns={columns}
        rows={contract.clins}
        csvName="clins"
        empty={
          <EmptyState
            title="No CLINs on this contract"
            hint="Carry CLINs from a pricing model (Pricing → CLIN Totals) or record them via modifications."
            icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
          />
        }
      />
      {contract.clins.length ? (
        <div className="mt-2 rounded-lg border bg-card px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
          <span className="text-muted-foreground">Total CLIN value</span>
          <span className="tnum font-semibold"><Money cents={totalValue} /></span>
          <span className="text-muted-foreground ml-auto">Total funded</span>
          <span className="tnum font-semibold">
            <Money cents={totalFunded} /> <span className="font-normal text-muted-foreground">({pctFunded}%)</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------- deliverables ------------------------------- */

function DeliverablesTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  const setStatus = (d: Deliverable, status: 'submitted' | 'accepted') => {
    action.mutate(
      { action: 'deliverableStatus', deliverableId: d.id, status },
      {
        onSuccess: () => toast({
          title: status === 'submitted' ? 'Deliverable marked submitted' : 'Deliverable marked accepted',
          description: `${d.title}${status === 'submitted' ? ' — awaiting COR acceptance.' : ' — accepted for the period of performance.'}`,
        }),
      },
    )
  }

  const columns: Column<Deliverable>[] = [
    {
      key: 'title', header: 'Deliverable', sortValue: (d) => d.title,
      render: (d) => (
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium truncate">{d.title}</div>
          {d.recipients ? <div className="text-[11px] text-muted-foreground truncate">To: {d.recipients}</div> : null}
        </div>
      ),
    },
    { key: 'did', header: 'DID', sortValue: (d) => d.didRef, render: (d) => <span className="font-mono text-[12px]">{d.didRef}</span> },
    { key: 'freq', header: 'Frequency', sortValue: (d) => d.frequency, render: (d) => <span className="text-[12.5px] text-muted-foreground">{d.frequency}</span> },
    {
      key: 'next', header: 'Next due', sortValue: (d) => d.nextDue ?? '',
      render: (d) => {
        const rel = fmtRelative(d.nextDue)
        const tone: PillTone =
          d.status === 'late' || rel.tone === 'past' ? 'danger'
            : rel.tone === 'today' || rel.tone === 'soon' || d.status === 'due_soon' ? 'warning'
              : 'muted'
        return (
          <div className="whitespace-nowrap">
            <DateText d={d.nextDue} /> <Pill tone={tone}>{rel.text}</Pill>
          </div>
        )
      },
    },
    { key: 'status', header: 'Status', sortValue: (d) => d.status, render: (d) => <StatusPill status={d.status} /> },
    {
      key: 'last', header: 'Last submitted', sortValue: (d) => d.lastSubmitted ?? '',
      render: (d) => d.lastSubmitted
        ? <span className="text-muted-foreground"><DateText d={d.lastSubmitted} /></span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'action', header: 'Action',
      render: (d) => {
        if (d.status === 'not_due' || d.status === 'due_soon') {
          return (
            <Button variant="outline" size="sm" className="h-7 text-[11.5px]" disabled={action.isPending} onClick={() => setStatus(d, 'submitted')}>
              Submit
            </Button>
          )
        }
        if (d.status === 'submitted') {
          return (
            <Button variant="outline" size="sm" className="h-7 text-[11.5px]" disabled={action.isPending} onClick={() => setStatus(d, 'accepted')}>
              Mark accepted
            </Button>
          )
        }
        if (d.status === 'late') {
          return (
            <Button size="sm" className="h-7 text-[11.5px]" disabled={action.isPending} onClick={() => setStatus(d, 'submitted')}>
              Submit now
            </Button>
          )
        }
        return <span className="text-[11.5px] text-muted-foreground">No action</span>
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={contract.deliverables}
      csvName="deliverables"
      empty={
        <EmptyState
          title="No deliverables"
          hint="CDRL deliverables with due schedules and DID references appear here."
          icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
        />
      }
    />
  )
}

/* -------------------------------- modifications ------------------------------ */

function ModificationsTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('administrative')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')

  const reset = () => { setType('administrative'); setValue(''); setDescription('') }

  const submit = () => {
    action.mutate(
      {
        action: 'addModification',
        type,
        valueDelta: value.trim() === '' ? undefined : parseFloat(value),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (d) => {
          toast({
            title: `${d.modification?.number ?? 'Modification'} recorded`,
            description: type === 'funding'
              ? 'Funding modification — obligated and funded amounts updated.'
              : `${titleCase(type)} modification recorded on ${contract.number}.`,
          })
          setOpen(false)
          reset()
        },
      },
    )
  }

  const columns: Column<Modification>[] = [
    { key: 'number', header: 'Number', sortValue: (m) => m.number, render: (m) => <span className="font-mono text-[12.5px] font-semibold">{m.number}</span> },
    {
      key: 'type', header: 'Type', sortValue: (m) => m.type,
      render: (m) => <Pill tone={MOD_TONE[m.type] ?? 'muted'}>{titleCase(m.type)}</Pill>,
    },
    { key: 'effective', header: 'Effective', sortValue: (m) => m.effectiveDate, render: (m) => <DateText d={m.effectiveDate} /> },
    {
      key: 'value', header: 'Value delta', className: 'text-right tnum', sortValue: (m) => m.valueDeltaCents,
      render: (m) => {
        if (m.valueDeltaCents === 0) return <span className="text-muted-foreground">—</span>
        if (m.valueDeltaCents > 0) return <span className="text-[var(--success)]">+{fmtMoney(m.valueDeltaCents)}</span>
        return <span className="text-[var(--danger)]">−{fmtMoney(Math.abs(m.valueDeltaCents))}</span>
      },
    },
    {
      key: 'desc', header: 'Description', sortValue: (m) => m.description,
      render: (m) => <span className="text-[12.5px] text-muted-foreground">{m.description}</span>,
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-[13px] font-semibold">Modifications</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />Add modification
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={contract.modifications}
        csvName="modifications"
        empty={
          <EmptyState
            title="No modifications"
            hint="Record administrative changes, funding actions, scope changes, and pop extensions here."
            icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
          />
        }
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record modification</DialogTitle>
            <DialogDescription>
              Funding modifications with a value delta increase the obligated and funded amounts on {contract.number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="mod-type" className="text-[12px]">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="mod-type" className="w-full mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['administrative', 'funding', 'scope', 'pop_extension', 'other'].map((t) => (
                    <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mod-value" className="text-[12px]">Value delta (USD)</Label>
              <Input
                id="mod-value" type="number" step={1000} className="mt-1.5 tnum"
                value={value} onChange={(e) => setValue(e.target.value)} placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Positive for additions, negative for descope. Applied to funding only when the type is funding.
              </p>
            </div>
            <div>
              <Label htmlFor="mod-desc" className="text-[12px]">Description</Label>
              <Textarea
                id="mod-desc" rows={3} className="mt-1.5 text-[12.5px]"
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose of the modification…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); reset() }}>Cancel</Button>
            <Button size="sm" disabled={action.isPending} onClick={submit}>Record modification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------------------------- options ---------------------------------- */

function OptionsTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  if (!contract.options.length) {
    return (
      <EmptyState
        title="No option periods"
        hint="Option periods with exercise-by dates and preliminary notice windows appear here."
        icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contract.options.map((o) => (
        <OptionCard key={o.id} option={o} action={action} />
      ))}
    </div>
  )
}

function OptionCard({ option, action }: { option: OptionPeriodRow; action: ContractAction }) {
  const [open, setOpen] = useState(false)
  const rel = fmtRelative(option.exerciseBy)
  const noticeRel = option.preliminaryNoticeBy ? fmtRelative(option.preliminaryNoticeBy) : null
  const urgent = rel.tone === 'past' || rel.tone === 'today' || rel.tone === 'soon'

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{option.label}</div>
          <div className="text-[11.5px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
            <span>Exercise by <DateText d={option.exerciseBy} /></span>
            <Pill tone={rel.tone === 'past' ? 'danger' : urgent ? 'warning' : 'muted'}>{rel.text}</Pill>
          </div>
          {option.preliminaryNoticeBy ? (
            <div className="text-[11px] text-muted-foreground mt-1">
              Preliminary notice <DateText d={option.preliminaryNoticeBy} />
              {noticeRel ? <> ({noticeRel.text.toLowerCase()})</> : null}
            </div>
          ) : null}
        </div>
        {option.exercised ? <Pill tone="success">Exercised</Pill> : <Pill tone="warning">Not exercised</Pill>}
      </div>

      {option.exercised ? (
        <div className="text-[12px] text-muted-foreground border-t pt-2.5">
          Exercised {option.exercisedAt ? <DateText d={option.exercisedAt} /> : '—'} · Modification{' '}
          <span className="font-mono font-medium text-foreground">{option.modNumber || '—'}</span>
        </div>
      ) : (
        <div className="border-t pt-2.5">
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant={urgent ? 'default' : 'outline'} disabled={action.isPending}>
                Exercise option
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Record the Government&apos;s exercise of {option.label}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  A modification will be recorded and the period of performance extended.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    action.mutate({ action: 'exerciseOption', optionId: option.id }, {
                      onSuccess: (d) => toast({
                        title: `Option exercised via ${d.modNumber ?? 'modification'}`,
                        description: 'End date extended and the modification recorded.',
                      }),
                    })
                  }
                >
                  Record exercise
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------- CPARS ----------------------------------- */

function CparsTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  if (!contract.cpars.length) {
    return (
      <EmptyState
        title="No CPARS evaluations"
        hint="Annual evaluations, ratings, narratives, and response deadlines appear here."
        icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />}
      />
    )
  }
  return (
    <div className="space-y-4">
      {contract.cpars.map((cp) => (
        <CparsCard key={cp.id} cpars={cp} action={action} />
      ))}
    </div>
  )
}

function CparsCard({ cpars, action }: { cpars: Cpars; action: ContractAction }) {
  const tone = CPARS_TONE[cpars.overallRating] ?? 'muted'
  const dueRel = cpars.responseDue ? fmtRelative(cpars.responseDue) : null
  const composerOpen = cpars.status === 'pending' && Boolean(cpars.responseDue)

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{cpars.periodLabel}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {dueRel ? (
            <Pill tone={dueRel.tone === 'past' ? 'danger' : dueRel.tone === 'today' || dueRel.tone === 'soon' ? 'warning' : 'muted'}>
              Response due {dueRel.text.toLowerCase()}
            </Pill>
          ) : null}
          <StatusPill status={cpars.status} />
        </div>
      </div>
      <div className="p-4 grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Overall rating</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-semibold leading-7">{cpars.overallRating || 'Not yet rated'}</span>
            {cpars.overallRating ? <Pill tone={tone}>{cpars.overallRating}</Pill> : null}
          </div>
          {cpars.ratings.length ? (
            <dl className="mt-3">
              {cpars.ratings.map((r, i) => (
                <KV key={i} label={r.factor}>{r.rating}</KV>
              ))}
            </dl>
          ) : (
            <p className="text-[12px] text-muted-foreground mt-2">Factor ratings have not been published yet.</p>
          )}
        </div>
        <div>
          {cpars.narrative ? (
            <blockquote className="border-l-2 border-border pl-3 text-[12.5px] text-muted-foreground italic leading-5">
              {cpars.narrative}
            </blockquote>
          ) : (
            <p className="text-[12px] text-muted-foreground">Narrative not yet available.</p>
          )}
          {composerOpen ? (
            <CparsComposer key={`${cpars.id}-${cpars.contractorComment}`} cpars={cpars} action={action} />
          ) : cpars.contractorComment ? (
            <div className="mt-3 text-[12px] leading-5">
              <span className="text-muted-foreground">Contractor comment: </span>
              {cpars.contractorComment}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CparsComposer({ cpars, action }: { cpars: Cpars; action: ContractAction }) {
  const [comment, setComment] = useState(cpars.contractorComment ?? '')

  return (
    <div className="mt-3 rounded-md border bg-background/50 p-3">
      <Label htmlFor={`cpars-${cpars.id}`} className="text-[11.5px]">Contractor response (comment)</Label>
      <Textarea
        id={`cpars-${cpars.id}`} rows={3} className="mt-1.5 text-[12.5px]"
        value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="Draft your response to the evaluation…"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <span className="text-[11px] text-muted-foreground">
          Saving a draft does not submit the formal response.
        </span>
        <Button
          variant="outline" size="sm" disabled={action.isPending}
          onClick={() =>
            action.mutate({ action: 'cparsRespond', cparsId: cpars.id, comment }, {
              onSuccess: () => toast({
                title: 'Response draft saved',
                description: `${cpars.periodLabel} comment stored for contracts review.`,
              }),
            })
          }
        >
          Save response draft
        </Button>
      </div>
    </div>
  )
}

/* ---------------------------------- closeout ---------------------------------- */

function CloseoutTab({ contract, action }: { contract: Contract; action: ContractAction }) {
  const items = contract.closeout
  const done = items.filter((i) => i.done).length

  if (!items.length) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h3 className="text-[13px] font-semibold">Closeout checklist</h3>
        </div>
        <EmptyState
          title="No closeout checklist yet"
          hint="Closeout checklist appears as the contract approaches end of period of performance."
          icon={<CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />}
        />
        <div className="border-t px-4 py-2.5 text-[11.5px] text-muted-foreground">
          Contract status moves to Closed when all items are complete.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Closeout checklist</h3>
        <span className="tnum text-[12px] text-muted-foreground">{done}/{items.length} complete</span>
      </div>
      <div className="px-4 pt-3">
        <Progress value={(done / items.length) * 100} className="h-2" />
      </div>
      <div className="p-2">
        {items.map((item) => (
          <label
            key={item.label}
            className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/40 cursor-pointer"
          >
            <Checkbox
              checked={item.done}
              aria-label={`Mark "${item.label}" ${item.done ? 'open' : 'complete'}`}
              onCheckedChange={(v) =>
                action.mutate({ action: 'closeoutItem', label: item.label, done: v === true }, {
                  onSuccess: () => toast({
                    title: `"${item.label}" ${v === true ? 'marked complete' : 'reopened'}`,
                  }),
                })
              }
            />
            <span className={cn('text-[13px]', item.done && 'text-muted-foreground line-through')}>{item.label}</span>
          </label>
        ))}
      </div>
      <div className="border-t px-4 py-2.5 text-[11.5px] text-muted-foreground">
        Contract status moves to Closed when all items are complete.
      </div>
    </div>
  )
}
