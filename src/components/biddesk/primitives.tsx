'use client'

import { ReactNode, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Inbox, Search } from 'lucide-react'

/* ---------------------------------- pills --------------------------------- */

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return <span className={cn('pill', `pill-${tone}`, className)}>{children}</span>
}

const STATUS_TONES: Record<string, PillTone> = {
  // generic
  confirmed: 'success', edited: 'success', final: 'success', accepted: 'success', approved: 'success',
  submitted: 'info', won: 'success', active: 'success', paid: 'success', executed: 'success', configured: 'success',
  extracted: 'info', drafting: 'info', in_review: 'warning', review: 'warning', in_progress: 'warning',
  due_soon: 'warning', pending: 'warning', late: 'danger', rejected: 'danger', lost: 'danger', error: 'danger',
  open: 'info', not_started: 'muted', not_due: 'muted', none: 'muted', draft: 'muted', disabled: 'muted',
  archived: 'muted', closed: 'muted', expired: 'danger', new: 'info', dismissed: 'muted', tracked: 'success',
  needs_input: 'warning', option_pending: 'warning', expiring: 'warning', deferred: 'muted',
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? 'muted'
  return <Pill tone={tone}>{label ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Pill>
}

/* ------------------------------- stat card -------------------------------- */

export function StatCard({
  label, value, sub, tone, className,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand'; className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 flex flex-col gap-1', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('tnum text-2xl font-semibold leading-7',
        tone === 'success' && 'text-[var(--success)]',
        tone === 'warning' && 'text-[var(--warning)]',
        tone === 'danger' && 'text-[var(--danger)]',
        tone === 'brand' && 'text-[var(--brand)]')}>
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/* ----------------------------- section header ----------------------------- */

export function SectionHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ------------------------------- empty state ------------------------------ */

export function EmptyState({
  icon, title, hint, action,
}: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/50 py-12 px-6 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" strokeWidth={1.5} />}</div>
      <div className="font-medium">{title}</div>
      {hint ? <p className="max-w-md text-[13px] text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  )
}

/* ------------------------------ coverage meter ---------------------------- */

export function CoverageMeter({ value, label, thresholds }: { value: number; label?: string; thresholds?: { warn: number; good: number } }) {
  const t = thresholds ?? { warn: 60, good: 85 }
  const tone = value >= t.good ? 'bg-[var(--success)]' : value >= t.warn ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
  return (
    <div className="min-w-36">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span>{label ?? 'Coverage'}</span>
        <span className="tnum font-medium text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

/* --------------------------------- pwin bar ------------------------------- */

export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const tone = score >= 70 ? 'bg-[var(--success)]' : score >= 45 ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="tnum text-xs font-medium w-8">{score}%</span>
    </div>
  )
}

/* -------------------------------- data table ------------------------------ */

export type Column<T> = {
  key: string
  header: string
  className?: string
  sortValue?: (row: T) => string | number
  render: (row: T) => ReactNode
}

export function DataTable<T extends { id: string }>({
  columns, rows, onRowClick, empty, csvName, dense, maxH,
}: {
  columns: Column<T>[]
  rows: T[]
  onRowClick?: (row: T) => void
  empty?: ReactNode
  csvName?: string
  dense?: boolean
  maxH?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
      return String(av).localeCompare(String(bv)) * sort.dir
    })
  }, [rows, sort, columns])

  const exportCsv = () => {
    const header = columns.map((c) => `"${c.header}"`).join(',')
    const body = sorted.map((row) =>
      columns.map((c) => {
        const v = c.sortValue ? c.sortValue(row) : ''
        return `"${String(v).replace(/"/g, '""')}"`
      }).join(','),
    ).join('\n')
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${csvName ?? 'biddesk-export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!rows.length && empty) return <>{empty}</>

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className={cn('overflow-auto scroll-thin', maxH)} style={maxH ? { maxHeight: maxH } : undefined}>
        <table className="w-full table-dense">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('text-left', c.className, c.sortValue && 'cursor-pointer select-none hover:text-foreground')}
                  onClick={() => c.sortValue && setSort((s) => s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort?.key === c.key ? <span className="text-[9px]">{sort.dir === 1 ? '▲' : '▼'}</span> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={cn(dense && 'py-1', c.className)}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {csvName ? (
        <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-1.5">
          <span className="tnum text-[11px] text-muted-foreground">{sorted.length} record{sorted.length === 1 ? '' : 's'}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={exportCsv}>
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------- filter bar ------------------------------- */

export function FilterInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-8 pl-8 text-[13px] w-56" />
    </div>
  )
}

/* --------------------------------- kv row --------------------------------- */

export function KV({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 border-b border-border/60 last:border-0', className)}>
      <dt className="text-xs text-muted-foreground whitespace-nowrap">{label}</dt>
      <dd className="text-[13px] font-medium text-right">{children}</dd>
    </div>
  )
}

/* ------------------------------- page layout ------------------------------ */

export function PageCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border bg-card', className)}>{children}</div>
}

export function FadeIn({ children, k }: { children: ReactNode; k?: string }) {
  return (
    <div key={k} className="animate-in fade-in duration-200">
      {children}
    </div>
  )
}

/* ------------------------------ money / dates ----------------------------- */

export function Money({ cents, exact, className }: { cents: number | null | undefined; exact?: boolean; className?: string }) {
  if (cents === null || cents === undefined) return <span className={className}>—</span>
  const v = exact
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
  return <span className={cn('tnum', className)}>{v}</span>
}

export function DateText({ d, className }: { d: string | Date | null | undefined; className?: string }) {
  if (!d) return <span className={className}>—</span>
  const date = typeof d === 'string' ? new Date(d) : d
  return (
    <span className={cn('tnum', className)}>
      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  )
}

/* ------------------------------ sample tag -------------------------------- */

export function SampleTag() {
  return <Pill tone="muted" className="border-dashed">Sample</Pill>
}
