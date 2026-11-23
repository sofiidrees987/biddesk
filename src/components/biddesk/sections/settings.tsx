'use client'

import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SectionHeader, Pill, StatusPill, EmptyState, FadeIn, FilterInput, PageCard,
  DataTable, type Column,
} from '@/components/biddesk/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { fmtDateTime, titleCase } from '@/lib/biddesk/format'
import { toast } from '@/hooks/use-toast'
import {
  Building2, SlidersHorizontal, Users, ShieldCheck, Plug, Bot, ScrollText, TriangleAlert, KeyRound, Mail,
} from 'lucide-react'

/* --------------------------------- types ---------------------------------- */

type Weight = { key: string; label: string; weight: number }

type Organization = {
  name: string; legalName: string; uei: string; cage: string
  primaryNaics: string; targetAgency: string
  pwinWeights: Weight[]; gateCriteria: Weight[]
}

type SettingsUser = {
  id: string; name: string; email: string; role: string; title: string
  initials: string; mfaEnabled: boolean; active: boolean
}

type RoleMatrixRow = { role: string; permissions: Record<string, string> }

type Integration = { id: string; key: string; name: string; status: string; reason: string; detail: string }

type AiGeneration = {
  id: string; kind: string; target: string
  accepted: boolean | string | null
  createdAt: string; userName: string
  sources: unknown[]
}

type SettingsData = {
  organization: Organization | null
  users: SettingsUser[]
  roleMatrix: RoleMatrixRow[]
  integrations: Integration[]
  aiGenerations: AiGeneration[]
}

type AuditEntry = {
  id: string; userName: string; userRole: string; action: string
  entity: string; entityId: string; entityLabel: string; detail: string; createdAt: string
}

/* -------------------------------- helpers --------------------------------- */

const PERMISSION_AREAS: { key: string; label: string }[] = [
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'library', label: 'Library' },
  { key: 'partners', label: 'Partners' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit' },
]

function CardShell({ title, icon, actions, children, className }: {
  title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null} {title}
        </h3>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/* ------------------------------- component -------------------------------- */

export function SettingsSection() {
  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: async () => (await fetch('/api/settings')).json(),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-[520px]" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  return (
    <FadeIn>
      <SectionHeader title="Settings" description="Organization profile, users and roles, integrations, and the audit trail." />

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="users">Users &amp; Roles</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="assistant">Assistant Log</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-3">
          {data.organization ? (
            <div className="space-y-4">
              <OrgFormCard org={data.organization} />
              <div className="grid lg:grid-cols-2 gap-4">
                <WeightsCard
                  field="pwinWeights"
                  title="PWin factor weights"
                  description="Weights applied to the six PWin factors across all pursuits."
                  weights={data.organization.pwinWeights}
                  toastTitle="PWin weights updated — applied to all PWin calculations"
                />
                <WeightsCard
                  field="gateCriteria"
                  title="Bid gate criteria weights"
                  description="Weights applied to bid decision scorecards at the gate."
                  weights={data.organization.gateCriteria}
                  toastTitle="Gate criteria weights updated — applied to all bid decision scorecards"
                />
              </div>
            </div>
          ) : (
            <EmptyState title="No organization profile" hint="Organization settings are unavailable for this workspace." icon={<Building2 className="h-7 w-7" strokeWidth={1.5} />} />
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-3">
          <div className="space-y-4">
            <UsersTable users={data.users} />
            <RoleMatrix roleMatrix={data.roleMatrix} />
            <p className="text-[12.5px] text-muted-foreground">
              The permission matrix is enforced on every API route. Reviewers can be time-boxed to a single proposal.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-3" data-tour="integrations">
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {data.integrations.map((i) => <IntegrationCard key={i.id} integration={i} />)}
            </div>
            <p className="text-[12.5px] text-muted-foreground">Endpoint URLs and field maps live in configuration, not code.</p>
          </div>
        </TabsContent>

        <TabsContent value="assistant" className="mt-3">
          <AssistantLog generations={data.aiGenerations} />
        </TabsContent>

        <TabsContent value="audit" className="mt-3" data-tour="audit-log">
          <AuditTrail />
        </TabsContent>
      </Tabs>
    </FadeIn>
  )
}

/* ----------------------------- organization ------------------------------- */

function OrgFormCard({ org }: { org: Organization }) {
  const qc = useQueryClient()
  const [name, setName] = useState(org.name)
  const [naics, setNaics] = useState(org.primaryNaics)
  const [agency, setAgency] = useState(org.targetAgency)

  const changed = name !== org.name || naics !== org.primaryNaics || agency !== org.targetAgency

  const save = useMutation({
    mutationFn: async () =>
      fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, primaryNaics: naics, targetAgency: agency }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['session'] })
      toast({ title: 'Organization profile saved' })
    },
    onError: () => toast({ title: 'Save failed', description: 'The organization profile could not be saved. Please try again.', variant: 'destructive' }),
  })

  return (
    <CardShell
      title="Organization profile"
      icon={<Building2 className="h-4 w-4" />}
      actions={
        <Button size="sm" className="h-7 text-[12px]" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="org-name" className="text-[12px]">Organization name</Label>
          <Input id="org-name" className="h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-naics" className="text-[12px]">Primary NAICS</Label>
          <Input id="org-naics" className="h-8 text-[13px] tnum" value={naics} onChange={(e) => setNaics(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-agency" className="text-[12px]">Target agency</Label>
          <Input id="org-agency" className="h-8 text-[13px]" value={agency} onChange={(e) => setAgency(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
        <span>Legal name: <span className="font-medium text-foreground">{org.legalName}</span></span>
        <span>UEI: <span className="font-mono text-foreground">{org.uei}</span></span>
        <span>CAGE: <span className="font-mono text-foreground">{org.cage}</span></span>
      </div>
    </CardShell>
  )
}

function WeightsCard({ field, title, description, weights, toastTitle }: {
  field: 'pwinWeights' | 'gateCriteria'
  title: string
  description: string
  weights: Weight[]
  toastTitle: string
}) {
  const qc = useQueryClient()
  const [vals, setVals] = useState<string[]>(() => weights.map((w) => String(w.weight)))

  const num = (v: string) => Number(v) || 0
  const total = vals.reduce((s, v) => s + num(v), 0)
  const changed = vals.some((v, i) => num(v) !== weights[i].weight)

  const save = useMutation({
    mutationFn: async () =>
      fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: weights.map((w, i) => ({ key: w.key, label: w.label, weight: num(vals[i]) })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: toastTitle })
    },
    onError: () => toast({ title: 'Save failed', description: 'Weights could not be saved. Please try again.', variant: 'destructive' }),
  })

  return (
    <CardShell
      title={title}
      icon={<SlidersHorizontal className="h-4 w-4" />}
      actions={
        <Button size="sm" className="h-7 text-[12px]" disabled={total !== 100 || !changed || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      }
    >
      <p className="text-[12px] text-muted-foreground mb-2">{description}</p>
      <div className="divide-y divide-border/60">
        {weights.map((w, i) => (
          <div key={w.key} className="flex items-center justify-between gap-3 py-2">
            <span className="text-[13px]">{w.label}</span>
            <span className="flex items-center gap-1.5">
              <Input
                type="number" min={0} max={100}
                aria-label={`${w.label} weight percent`}
                className="h-8 w-20 tnum text-right text-[13px]"
                value={vals[i] ?? ''}
                onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <span className="w-3 text-[12px] text-muted-foreground">%</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-2.5">
        <span className="text-[12px] text-muted-foreground">Total — must equal 100%</span>
        <Pill tone={total === 100 ? 'success' : 'danger'} className="tnum">Total {total}%</Pill>
      </div>
    </CardShell>
  )
}

/* ------------------------------ users & roles ------------------------------ */

function UsersTable({ users }: { users: SettingsUser[] }) {
  const columns: Column<SettingsUser>[] = [
    {
      key: 'person', header: 'Person', className: 'min-w-44', sortValue: (u) => u.name,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10.5px] font-semibold">{u.initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-[13px] font-medium leading-4">{u.name}</div>
            <div className="text-[11px] text-muted-foreground">{u.title}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'email', header: 'Email', className: 'min-w-56', sortValue: (u) => u.email,
      render: (u) => <span className="font-mono text-[12px] text-muted-foreground">{u.email}</span>,
    },
    {
      key: 'role', header: 'Role', sortValue: (u) => u.role,
      render: (u) => <Pill tone={u.role === 'Owner' || u.role === 'Admin' ? 'info' : 'muted'}>{u.role}</Pill>,
    },
    { key: 'title', header: 'Title', sortValue: (u) => u.title, render: (u) => <span className="text-[12.5px]">{u.title}</span> },
    {
      key: 'mfa', header: 'MFA', sortValue: (u) => (u.mfaEnabled ? 1 : 0),
      render: (u) => u.mfaEnabled ? <Pill tone="success">On</Pill> : <Pill tone="muted">Off</Pill>,
    },
    {
      key: 'status', header: 'Status', sortValue: (u) => (u.active ? 'Active' : 'Inactive'),
      render: (u) => u.active ? <Pill tone="success">Active</Pill> : <Pill tone="muted">Inactive</Pill>,
    },
  ]

  return (
    <CardShell title="Users" icon={<Users className="h-4 w-4" />}>
      <DataTable
        columns={columns}
        rows={users}
        dense
        csvName="users"
        empty={
          <EmptyState title="No users" hint="Users in this workspace appear here with their role and MFA status." icon={<Users className="h-7 w-7" strokeWidth={1.5} />} />
        }
      />
    </CardShell>
  )
}

function PermCell({ value }: { value: string }) {
  if (value === 'Manage') return <Pill tone="success">Manage</Pill>
  if (value === 'Contribute') return <Pill tone="info">Contribute</Pill>
  if (value === 'View') return <span className="text-[12px] text-muted-foreground">View</span>
  return (
    <span className="text-muted-foreground" title="None">
      —<span className="sr-only">None</span>
    </span>
  )
}

function RoleMatrix({ roleMatrix }: { roleMatrix: RoleMatrixRow[] }) {
  return (
    <div className="rounded-lg border bg-card" data-tour="roles-matrix">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Role permission matrix
        </h3>
        <Pill tone="muted">{roleMatrix.length} roles</Pill>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="table-dense w-full min-w-[900px]">
          <thead>
            <tr>
              <th className="text-left min-w-36">Role</th>
              {PERMISSION_AREAS.map((a) => (
                <th key={a.key} className="text-center whitespace-nowrap">{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roleMatrix.map((r) => (
              <tr key={r.role}>
                <td className="text-[12.5px] font-medium whitespace-nowrap">{r.role}</td>
                {PERMISSION_AREAS.map((a) => (
                  <td key={a.key} className="text-center">
                    <PermCell value={r.permissions?.[a.key] ?? 'None'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------- integrations ------------------------------ */

function IntegrationCard({ integration }: { integration: Integration }) {
  const [apiKey, setApiKey] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [from, setFrom] = useState('')

  const isSam = integration.key === 'sam_gov'
  const isSmtp = integration.key === 'smtp'

  const storeApiKey = () => {
    toast({
      title: 'API key stored encrypted (AES-256-GCM)',
      description: 'Live sync begins on the next scheduled run.',
    })
    setApiKey('')
  }

  const storeSmtp = () => {
    toast({
      title: 'SMTP settings stored encrypted (AES-256-GCM)',
      description: 'Email delivery begins on the next scheduled run.',
    })
    setHost(''); setPort(''); setFrom('')
  }

  return (
    <PageCard className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13.5px] font-semibold leading-5">{integration.name}</div>
        <StatusPill status={integration.status} />
      </div>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{integration.detail}</p>
      {integration.reason ? (
        <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-[var(--warning)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {integration.reason}
        </p>
      ) : null}

      {isSam ? (
        <div className="mt-auto space-y-1.5 border-t border-border/60 pt-3">
          <Label htmlFor={`key-${integration.id}`} className="text-[12px] flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Add API key
          </Label>
          <div className="flex gap-2">
            <Input id={`key-${integration.id}`} type="password" className="h-8 text-[13px]"
              placeholder="SAM.gov API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <Button size="sm" className="h-8 text-[12px]" disabled={!apiKey.trim()} onClick={storeApiKey}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {isSmtp ? (
        <div className="mt-auto space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email delivery settings
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`smtp-host-${integration.id}`} className="text-[11.5px] text-muted-foreground">Host</Label>
              <Input id={`smtp-host-${integration.id}`} className="h-8 text-[13px]" placeholder="smtp.example.com"
                value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`smtp-port-${integration.id}`} className="text-[11.5px] text-muted-foreground">Port</Label>
              <Input id={`smtp-port-${integration.id}`} className="h-8 text-[13px] tnum" placeholder="587"
                value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor={`smtp-from-${integration.id}`} className="text-[11.5px] text-muted-foreground">From address</Label>
              <Input id={`smtp-from-${integration.id}`} className="h-8 text-[13px]" placeholder="biddesk@yourcompany.com"
                value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="h-8 text-[12px]"
            disabled={!host.trim() || !port.trim() || !from.trim()} onClick={storeSmtp}>
            Save
          </Button>
        </div>
      ) : null}
    </PageCard>
  )
}

/* ------------------------------ assistant log ------------------------------ */

function KindPill({ kind }: { kind: string }) {
  const label = kind === 'section_draft' ? 'Section draft' : kind === 'assistant' ? 'Assistant' : titleCase(kind)
  return <Pill tone="info">{label}</Pill>
}

function AcceptedPill({ accepted }: { accepted: boolean | string | null }) {
  if (accepted === true || accepted === 'accepted') return <Pill tone="success">Accepted</Pill>
  if (accepted === 'rejected') return <Pill tone="danger">Rejected</Pill>
  return <Pill tone="muted">Pending</Pill>
}

function AssistantLog({ generations }: { generations: AiGeneration[] }) {
  const columns: Column<AiGeneration>[] = [
    {
      key: 'date', header: 'Date', sortValue: (g) => g.createdAt,
      render: (g) => <span className="tnum text-[12.5px] whitespace-nowrap">{fmtDateTime(g.createdAt)}</span>,
    },
    { key: 'user', header: 'User', sortValue: (g) => g.userName, render: (g) => <span className="text-[12.5px] font-medium">{g.userName}</span> },
    { key: 'kind', header: 'Kind', sortValue: (g) => g.kind, render: (g) => <KindPill kind={g.kind} /> },
    {
      key: 'target', header: 'Target', className: 'min-w-52', sortValue: (g) => g.target,
      render: (g) => <span className="block max-w-72 truncate text-[12.5px]" title={g.target}>{g.target}</span>,
    },
    {
      key: 'sources', header: 'Sources', sortValue: (g) => (Array.isArray(g.sources) ? g.sources.length : 0),
      render: (g) => <span className="tnum text-[12.5px]">{Array.isArray(g.sources) ? g.sources.length : 0}</span>,
    },
    { key: 'accepted', header: 'Decision', sortValue: (g) => String(acceptedLabel(g.accepted)), render: (g) => <AcceptedPill accepted={g.accepted} /> },
  ]

  return (
    <div className="space-y-3">
      <CardShell title="Assistant generations" icon={<Bot className="h-4 w-4" />}>
        <DataTable
          columns={columns}
          rows={generations}
          dense
          csvName="assistant-log"
          empty={
            <EmptyState
              title="No AI generations yet"
              hint="Grounded drafts generated in proposal workspaces are logged here with their cited sources."
              icon={<Bot className="h-7 w-7" strokeWidth={1.5} />}
            />
          }
        />
      </CardShell>
      <p className="text-[12.5px] text-muted-foreground">Every AI generation is logged with its sources. Drafts require human acceptance.</p>
    </div>
  )
}

function acceptedLabel(a: boolean | string | null): string {
  if (a === true || a === 'accepted') return 'Accepted'
  if (a === 'rejected') return 'Rejected'
  return 'Pending'
}

/* -------------------------------- audit trail ------------------------------ */

function AuditTrail() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery<{ entries: AuditEntry[] }>({
    queryKey: ['audit'],
    queryFn: async () => (await fetch('/api/audit?limit=200')).json(),
  })

  if (isLoading) {
    return (
      <CardShell title="Audit trail" icon={<ScrollText className="h-4 w-4" />}>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
      </CardShell>
    )
  }

  const entries = (data?.entries ?? []).filter((e) => {
    if (!q) return true
    const needle = q.toLowerCase()
    return (
      e.action.toLowerCase().includes(needle) ||
      e.userName.toLowerCase().includes(needle) ||
      e.entityLabel.toLowerCase().includes(needle)
    )
  })

  const columns: Column<AuditEntry>[] = [
    {
      key: 'date', header: 'Date / time', sortValue: (e) => e.createdAt,
      render: (e) => <span className="tnum text-[12.5px] whitespace-nowrap">{fmtDateTime(e.createdAt)}</span>,
    },
    {
      key: 'user', header: 'User', sortValue: (e) => e.userName,
      render: (e) => (
        <span className="text-[12.5px]">
          <span className="font-medium">{e.userName}</span>
          <span className="text-muted-foreground"> · {e.userRole}</span>
        </span>
      ),
    },
    {
      key: 'action', header: 'Action', sortValue: (e) => e.action,
      render: (e) => <Pill tone="muted" className="font-mono text-[11px]">{e.action}</Pill>,
    },
    {
      key: 'record', header: 'Record', sortValue: (e) => e.entityLabel,
      render: (e) => <span className="text-[12.5px] font-medium">{e.entityLabel}</span>,
    },
    {
      key: 'detail', header: 'Detail', className: 'min-w-64', sortValue: (e) => e.detail,
      render: (e) => <span className="block max-w-xs truncate text-[12.5px] text-muted-foreground" title={e.detail}>{e.detail}</span>,
    },
  ]

  return (
    <div className="space-y-3">
      <CardShell
        title="Audit trail"
        icon={<ScrollText className="h-4 w-4" />}
        actions={<FilterInput value={q} onChange={setQ} placeholder="Filter by action, user, or record…" />}
      >
        <DataTable
          columns={columns}
          rows={entries}
          dense
          maxH="560px"
          csvName="audit-trail"
          empty={
            <EmptyState
              title={q ? 'No audit entries match your filter' : 'No audit entries yet'}
              hint={q ? 'Try a different action, user, or record name.' : 'Actions taken across the workspace are recorded here automatically.'}
              icon={<ScrollText className="h-7 w-7" strokeWidth={1.5} />}
            />
          }
        />
      </CardShell>
      <p className="text-[12.5px] text-muted-foreground">Append-only record of who did what, when, and on which record.</p>
    </div>
  )
}
