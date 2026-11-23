/** Shared formatting helpers — tabular-numeral money and date display. */

export function fmtMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

export function fmtMoneyExact(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function fmtMoneyCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const d = cents / 100
  if (Math.abs(d) >= 1_000_000) return '$' + (d / 1_000_000).toFixed(d % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (Math.abs(d) >= 1_000) return '$' + (d / 1_000).toFixed(d % 1_000 === 0 ? 0 : 1) + 'K'
  return '$' + d.toFixed(0)
}

export function fmtRate(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function fmtBps(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2) + '%'
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function fmtRelative(d: string | Date | null | undefined): { text: string; tone: 'past' | 'today' | 'soon' | 'later' } {
  if (!d) return { text: '—', tone: 'later' }
  const date = typeof d === 'string' ? new Date(d) : d
  const days = Math.ceil((date.getTime() - Date.now()) / 86400_000)
  if (days < -1) return { text: `${-days} days ago`, tone: 'past' }
  if (days === -1) return { text: 'Yesterday', tone: 'past' }
  if (days === 0) return { text: 'Today', tone: 'today' }
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' }
  if (days <= 7) return { text: `In ${days} days`, tone: 'soon' }
  return { text: `In ${days} days`, tone: 'later' }
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const NOTICE_TYPES: Record<string, string> = {
  presolicitation: 'Presolicitation',
  sources_sought: 'Sources Sought',
  solicitation: 'Solicitation',
  combined_synopsis: 'Combined Synopsis/Solicitation',
  special_notice: 'Special Notice',
  award_notice: 'Award Notice',
}

export const STAGE_LABELS: Record<string, string> = {
  identified: 'Identified',
  qualifying: 'Qualifying',
  capture: 'Capture Planning',
  bid_decision: 'Bid Decision',
  proposal: 'Proposal',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost / No-Bid',
}

export const REQ_KINDS: Record<string, string> = {
  instruction: 'Instruction',
  evaluation: 'Evaluation Criterion',
  sow_task: 'SOW Task',
  deliverable: 'Deliverable',
  clause: 'Clause',
}

export const SECTION_STATUS: Record<string, string> = {
  not_started: 'Not started',
  drafting: 'Drafting',
  in_review: 'In review',
  final: 'Final',
}

export const PROPOSAL_STATUS: Record<string, string> = {
  intake: 'Intake',
  requirements: 'Requirements',
  writing: 'Writing',
  review: 'Review',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
}

export const CONTRACT_STATUS: Record<string, string> = {
  active: 'Active',
  option_pending: 'Option Pending',
  expiring: 'Expiring',
  closed: 'Closed',
}

export function pct(n: number): string {
  return Math.round(n) + '%'
}
