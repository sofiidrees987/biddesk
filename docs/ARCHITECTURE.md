# BidDesk — Architecture Documentation

This file consolidates the engineering decision record and the frontend section contract.

---

# BidDesk — Engineering Decisions

This file records every decision where the environment, available tooling, or professional judgment
required a deviation from, or interpretation of, the original build specification.

## 1. Runtime and stack

**Decision**: BidDesk is implemented as a single Next.js 16 application (App Router, TypeScript
strict) with Prisma ORM over SQLite, instead of a split Fastify backend + Vite frontend over
PostgreSQL with containers.

**Reason**: The deployment environment for this build is a managed Next.js sandbox: one process,
one exposed port, `bun` as the runtime, and Prisma configured for SQLite. The original stack
(Fastify, PostgreSQL 16 with pgvector, pg-boss, Docker Compose, nginx-served SPA) cannot run in
this environment.

**What was preserved from the specification**:
- The complete domain model (Opportunity → Pursuit → Proposal → Pricing → Contract → Past
  Performance), multi-tenant `orgId` scoping on every business table, soft conventions for audit
  and notifications.
- REST API surface under `/api/*` with JSON contracts, session auth via httpOnly cookies, and
  structured error bodies.
- Decimal-safe money: all amounts are integer cents; all rates are integer basis points; the
  loaded-rate build-up (base → fringe → overhead → G&A → fee) rounds once per step in integer
  arithmetic (see `src/lib/money.ts`, `src/lib/pricing-engine.ts`).
- The full section surface: Dashboard, Opportunities, Pipeline, Proposals, Pricing, Contracts,
  Library, Partners, Reports, Settings, plus global search (Ctrl/Cmd+K), notifications, and the
  Assistant.

**What was consciously adapted**:
- PostgreSQL RLS, pgvector hybrid search, and pg-boss jobs are replaced by org-scoped queries in
  the data-access layer, keyword retrieval over records, and synchronous operations. The seams
  are documented here so a PostgreSQL deployment can reintroduce them.
- OpenAPI/Swagger generation is not wired (no `@fastify/swagger` equivalent in this runtime); the
  API contract is documented in `docs/FRONTEND-CONTRACT.md`.
- OIDC SSO and TOTP MFA are represented in the product surface (MFA flag on users, SSO in the
  integrations panel) but the demonstration authenticates with email + password against
  seeded accounts. Argon2 is specified for production; the demonstration uses SHA-256 hashing
  because no external password library is available in the sandbox runtime.

## 2. The interactive demonstration

**Decision**: The standalone `demo/index.html` deliverable is replaced by the live application
itself, pre-seeded with clearly-labeled sample data, with a persistent banner ("Interactive
demonstration. All data shown is sample data.") and a Reset control.

**Reason**: The environment serves exactly one user-facing route (`/`) on one port; a separate
static HTML file could not be previewed by the viewer. The live application is a strictly better
demonstration: every interaction exercises the real API and database rather than scripted state.

**What was preserved**:
- Guided walkthrough ("Start walkthrough" in the banner or user menu): an 11-step tour of the
  lifecycle with section navigation, target highlighting, next/back/skip.
- Viewer input that flows through the product: the first-run dialog collects company name,
  primary NAICS, and target agency, which persist to the organization profile and drive match
  scoring context.
- Sample data labeled at the surface: persistent banner, "Sample upload" pills on solicitation
  documents, demonstration account list on the sign-in card.
- Reset control: re-seeds the demonstration workspace to its initial state.

## 3. Data sources

**Decision**: The SAM.gov adapter ships in a `disabled` state with a clear reason ("API key
required") surfaced in Settings → Integrations; no live API keys are configured.

**Reason**: The specification explicitly forbids fabricating or mocking data to make an adapter
appear to work, and no SAM.gov API key is available in this environment. The adapter status,
reason, and manual entry / CSV import / email-forward intake paths are all represented honestly
in the UI. USAspending and GSA CALC+ panels describe their configured status; benchmark values
shown in Pricing are sample ranges labeled as such.

## 4. AI layer

**Decision**: Grounded drafting and the Assistant run through the platform's LLM provider with a
deterministic, citation-preserving fallback.

**How it works**:
- Section drafts are assembled server-side from the section's linked requirements plus **approved
  Library items only** (approved boilerplate and past performance), each claim carrying a `[Sn]`
  citation. The LLM (z-ai-web-dev-sdk, backend-only) may polish the assembled draft, but its
  output is accepted only if every original citation survives verbatim; otherwise the assembled
  draft stands.
- If grounded support is insufficient, the endpoint returns a structured `needs_input` response
  listing exactly what is missing — never invented text.
- Drafts are suggestions: the author must Accept (content is written, acceptance logged) or
  Reject (rejection logged). Every generation is recorded in `ai_generations` and viewable in
  Settings → Assistant Log.
- The Assistant panel answers record questions with citations; deterministic answers are computed
  directly from the database for known question patterns, and free-form questions go to the LLM
  with a compact record context and rules forbidding invention. If AI is unavailable the panel
  degrades to guidance, and the product works fully without generation features.

## 5. Pricing math

**Decision**: All money is integer cents; rates are integer basis points; escalation compounds
per period; the fee applies to escalated total cost. Verified totals for the seeded model:
$7,955,756.80 cost / $8,583,572.00 price across base + three option periods at 3.0% escalation.

**Rounding**: one rounding (half-up, integer arithmetic) per multiplication step — `mulBps`
in `src/lib/money.ts`. No floating point touches money anywhere in the stack.

## 6. Security posture (honest scope)

Implemented in this build: session auth with httpOnly cookies, per-org data scoping on every
query, role labels with a permission matrix surfaced in Settings, an append-only audit log with
viewer and CSV export, and per-document AI-processing intent represented in the Library policy.

Represented but not enforceable in this sandbox (documented, not claimed): MFA enforcement at
login, OIDC SSO, API keys, rate limiting, ClamAV scanning, CUI marking enforcement at the storage
layer, encryption of integration secrets at rest. The README states plainly: BidDesk provides
the technical controls; certification and hosting-environment compliance (FedRAMP, CMMC) are the
deploying organization's responsibility.

## 7. Demonstration data

All seed records are fictional sample data for the demonstration workspace: Harbor Point
Technologies (fictional small business), six named users, twelve fictional solicitations
(realistic formats, fictional numbers), pursuits, a 42-requirement compliance matrix across
Section L / M / PWS / CDRL / FAR sources, a pricing model, three contracts, library content,
and partners. No real solicitation, agency record, or private individual is represented. The
production-intent seed policy (reference data only, no sample business data) is documented in
`prisma/seed.ts` for deployments that exclude the demonstration workspace.

---

# BidDesk Frontend Section Contract

This document is the binding contract for building section components. Read it fully before writing code.

## Architecture

- Next.js 16 App Router, single user route `src/app/page.tsx` → `src/components/biddesk/shell.tsx` renders the active section from `useBidStore().section`.
- Each section lives in `src/components/biddesk/sections/<name>.tsx` and exports the exact component name listed below. Sections are client components ('use client').
- Data fetching: `@tanstack/react-query` `useQuery`/`useMutation`. API base is relative (`/api/...`). Invalidate queries after mutations.
- State: `useBidStore` from `@/lib/biddesk/store` — `section`, `params` (per-section record ids), `go(section, params)`, `setParam(section, key, value)`.
  - Access current section params: `useBidStore((s) => s.params.pipelines?.id)` etc. `go` sets params and switches section.
- The session/user: `useSession()` from `@/components/biddesk/app` (react-query). `data.user`, `data.org`.
- Money is ALWAYS integer cents. Format with helpers from `@/lib/biddesk/format` (see below). NEVER do floating point money math in the frontend.

## Shared imports (do not create your own versions)

From `@/components/biddesk/primitives`:
- `Pill tone="success|warning|danger|info|muted"` — semantic pill
- `StatusPill status="confirmed" label?` — auto-toned status pill (has all statuses mapped)
- `StatCard {label, value, sub?, tone?}` — KPI card
- `SectionHeader {title, description?, actions?}` — page header with actions
- `EmptyState {icon?, title, hint?, action?}` — informative empty state, NEVER fake data
- `CoverageMeter {value, label?, thresholds?}` — progress bar
- `ScoreBar {score}` — 0-100 bar for PWin
- `DataTable<T> {columns, rows, onRowClick?, empty?, csvName?, dense?, maxH?}` — sticky-header dense table with sort + CSV export. `Column<T> = {key, header, className?, sortValue?, render}`
- `FilterInput {value, onChange, placeholder?}` — search input
- `KV {label, children}` — definition row for detail panels
- `PageCard`, `FadeIn {children, k?}` (wrap section root), `Money {cents, exact?}`, `DateText {d}`, `SampleTag`
- Loading: use `Skeleton` from `@/components/ui/skeleton`

From `@/lib/biddesk/format`:
- `fmtMoney(cents)`, `fmtMoneyExact(cents)`, `fmtMoneyCompact(cents)`, `fmtRate(cents)`, `fmtBps(bps)` (e.g. 800→"8%"), `fmtDate(d)`, `fmtDateTime(d)`, `fmtRelative(d) → {text, tone}`, `titleCase(s)`
- Label maps: `NOTICE_TYPES`, `STAGE_LABELS`, `REQ_KINDS`, `SECTION_STATUS`, `PROPOSAL_STATUS`, `CONTRACT_STATUS`, `pct(n)`

shadcn/ui available in `@/components/ui/*`: button, input, label, tabs, dialog, alert-dialog, sheet, drawer, select, checkbox, switch, slider, tooltip, popover, dropdown-menu, badge, card, table, textarea, separator, scroll-area, collapsible, accordion, progress, skeleton, avatar, alert, sonner/toast (`toast` from `@/hooks/use-toast`), command, hover-card.
Icons: `lucide-react`.
Charts: `recharts` (BarChart, LineChart, ResponsiveContainer etc.) or hand-rolled SVG. Keep charts simple, brand colors: `var(--chart-1)` etc.

## Design rules (strict)

- Brand: plain, trustworthy business software. NO emojis, no hype words, no purple/neon gradients, no glow.
- Dense, professional, data-first. 14px base (already set). Cards: `rounded-lg border bg-card`.
- Record pages use TABS (shadcn Tabs) so nothing becomes a long scroll. Lists use `DataTable`.
- Every list has: loading skeletons, an informative EmptyState (never fake data), a filter/search input, and CSV export where tabular.
- Statuses always via `StatusPill`. Money/dates via `Money`/`DateText` (tabular numerals).
- Buttons h-8 with text-[12px] for toolbars. Primary action = `size="sm"`.
- All interactive elements keyboard accessible; visible focus (focus-ring class available).
- Responsive: works at 375px (cards stack) and 1440px (dense grids). Use `grid-cols-1 md:grid-cols-2 lg:grid-cols-*`.
- Use `data-tour="..."` attributes where noted so the walkthrough can highlight.
- Toasts after successful mutations: `toast({ title: '…', description: '…' })`.
- Wrap section root in `<FadeIn>` from primitives.

## API shapes (authoritative)

All endpoints require the session cookie (automatic). Errors: `{error, detail}`. Money = integer cents. Dates = ISO strings.

### GET /api/opportunities?q&status&noticeType&setAside&naics
```
{ opportunities: [{ id, source, noticeType, title, solicitationNumber, agency, subTier, office,
    postedDate, responseDeadline, naics, psc, setAside, popCity, popState, description,
    estimatedValueCents, valueLabel, matchScore, matchFactors: [{key,label,score,weight,detail}],
    status, dismissedReason }],
  savedSearches: [{id, name, criteria, alertsEnabled, digest}],
  facets: {noticeTypes[], setAsides[], naics[], agencies[]} }
```

### POST /api/opportunities
`{action:"track", id}` → `{pursuit}` | `{action:"dismiss", id, reason}` → `{ok}` | `{action:"restore", id}` → `{ok}` | `{action:"addManual", title, agency?, naics?, setAside?, deadline?, value?, description?}` → `{opportunity}`

### GET /api/pursuits
```
{ pursuits: [{ id, title, agency, stage, captureLead, expectedValueCents, totalValueCents, pwin,
    weightedValueCents, gateStatus, gateDecision, gateScore: [{key,label,score,weight,comment}],
    gateApprovedBy, gateApprovedAt, decisionDate, winThemes: string[], noBidReason, competitorNote,
    opportunityId, opportunity: {id, title, solicitationNumber, responseDeadline, noticeType} | null,
    pwinFactors: [{id, key, label, score, weight, detail}],
    teaming: [{id, partnerId, partnerName, role, worksharePct, ndaStatus, taStatus}] }],
  partners: [{id, name, certifications, performanceRating, capabilities}],
  stageOrder: string[], pwinWeights, gateCriteria }
```

### PATCH /api/pursuits
`{id, stage}` | `{id, pwinFactors: [{key, score}]}` → `{ok, pwin}` | `{id, gate: {scores: [{key,label,score,weight,comment}], decision: "Bid"|"No-Bid", noBidReason?}}` → `{ok, stage, avgScore}` | `{id, winThemes: string[]}` | `{id, competitorNote}` | `{id, teaming: {partnerId, role?, worksharePct?, ndaStatus?, taStatus?}}` → `{teaming}`

### POST /api/pursuits  `{action:"won", id}` → `{contractId}` (marks won, creates contract shell)

### GET /api/proposals → `{proposals: [{id, title, solicitationNumber, agency, status, dueAt, contractType, daysRemaining, coveragePct, requirementCount, sectionsTotal, sectionsFinal, pursuitTitle}]}`
### GET /api/proposals?id=<id>
```
{ proposal: { id, title, solicitationNumber, agency, status, dueAt, contractType, notes,
    pursuit: {id, title, pwin, stage} | null,
    requirements: [{id, ref, text, obligation, kind, sourceDoc, page, paragraph, sourceExcerpt, confidence, status, sectionKey, owner}],
    sections: [{id, volume, key, title, instructions, pageLimit, content, assignee, dueDate, status, order, winTheme, wordCount}],
    reviewCycles: [{id, kind, status, scheduledAt, summary: {findingsTotal?, findingsOpen?, blockers?, notes?}, findings: [{id, sectionKey, severity, comment, disposition, response}]}] } }
```
### PATCH /api/proposals
`{id, requirement: {id, status: "confirmed"|"rejected"|"extracted", text?, sectionKey?}}` |
`{id, section: {id, content?}}` (auto-moves not_started→drafting) | `{id, section: {id, status}}` |
`{id, finding: {id, disposition: "accepted"|"rejected"|"deferred"|"open", response?}}` |
`{id, review: {id, action: "start"|"complete"}}` |
`{id, status}`

### POST /api/proposals/draft  `{proposalId, sectionId}` →
`{status:"draft", draft: string (has [S1]…[Sn] citations), sources: [{id, type: "requirement"|"library"|"past_performance", ref, title, excerpt}], engine}` OR
`{status:"needs_input", missing: string[]}`
### PUT /api/proposals/draft  `{sectionId, accepted: boolean}` — records the accept/reject decision

### GET /api/pricing → `{rateSets: [{id, name, effectiveDate, source, status, fringeBps, overheadBps, overheadGovBps, materialHandlingBps, gaBps, feeBps, laborCategories: [{id, title, description, baseRateCents, clearance, minYears, benchmarkLowCents, benchmarkHighCents}]}], models: [{id, name, contractType, status, escalationBps, periods, proposalTitle}]}`
### GET /api/pricing?id=<modelId>
```
{ engine: { rateSet: {id, name, fringeBps, overheadBps, gaBps, feeBps, materialHandlingBps, overheadGovBps, source, effectiveDate},
    periods: [{label, startDate, endDate, months}], escalationBps,
    loadedRates: [{lcatId, lcatTitle, baseRateCents, fringe, overhead, cost, ga, totalCost, fee, price, benchmarkLowCents, benchmarkHighCents}],
    hours: [{lcatId, lcatTitle, hours: number[]}],
    odcLines: [{title, periodIndex, unitCostCents}],
    periodTotals: [{periodIndex, label, laborCostCents, odcCents, totalCostCents, priceCents, clinRef}],
    grandTotal: {costCents, priceCents},
    clins: [{ref, name, type, periodLabel, valueCents}] },
  scenarios: { feeMinus, feePlus, escMinus, escPlus, hoursMinus, hoursPlus } (each = EngineResult),
  model: {id, name, contractType, status, proposalId} }
```
### PATCH /api/pricing  `{id, rates: {fringeBps?, overheadBps?, gaBps?, feeBps?}}` and/or `{id, escalationBps}` and/or `{id, hours: [{lcatId, periodIndex, hours}]}` → `{engine}` (recomputed)
### POST /api/pricing  `{action:"createContractClins", id, contractId}` → `{ok, clinCount, totalCents}`

### GET /api/contracts → `{contracts: [{id, number, agency, type, vehicle, status, startDate, endDate, popLabel, ceilingCents, obligatedCents, fundedCents, deliverableIssues, optionPending}]}`
### GET /api/contracts?id=<id>
```
{ contract: { id, number, vehicle, type, agency, coName, corName, status, awardDate, startDate, endDate,
    popLabel, ceilingCents, obligatedCents, fundedCents, closeout: [{label, done}], pastPerformanceAdded,
    pursuit, clins: [{id, ref, name, type, periodLabel, valueCents, fundedCents}],
    deliverables: [{id, title, didRef, frequency, nextDue, status, lastSubmitted, recipients}],
    modifications: [{id, number, type, effectiveDate, valueDeltaCents, description}],
    options: [{id, label, exerciseBy, preliminaryNoticeBy, exercised, exercisedAt, modNumber}],
    cpars: [{id, periodLabel, status, overallRating, ratings: [{factor, rating}], narrative, responseDue, contractorComment}],
    invoices: [{id, reference, period, amountCents, status}],
    subcontractors: [{id, name, valueCents, smallBusiness}] } }
```
### POST /api/contracts
`{id, action:"deliverableStatus", deliverableId, status}` | `{id, action:"addModification", type, valueDelta?, description?}` → `{modification}` | `{id, action:"exerciseOption", optionId}` → `{ok, modNumber}` | `{id, action:"cparsRespond", cparsId, comment}` | `{id, action:"addToLibrary"}` → `{pastPerformanceId}` | `{id, action:"closeoutItem", label, done}`

### GET /api/library?q= → `{companyProfile: {name, legalName, uei, cage, samExpiry, primaryNaics, naicsList[], sizeStandard, certifications, vehicles, facilityClearance, dcaaStatus, sprsScore, sprsDate}, pastPerformances: [{…, tags: string[], status}], resumes: [{…, certifications: string[], status}], items: [{id, category, title, content, tags, status, owner, reviewBy, useCount}]}`
### PATCH /api/library  `{id, status: "draft"|"approved"|"archived"}`

### GET /api/partners → `{partners: [{id, name, uei, capabilities, certifications, location, naics, ndaStatus, taStatus, performanceRating, notes, teaming: [{id, pursuitTitle, role, worksharePct}]}]}`
### PATCH /api/partners  `{id, ndaStatus?, taStatus?, notes?}`

### GET /api/reports →
```
{ pipelineByStage: [{stage, count, valueCents, weightedCents}],
  winLoss: {won, lost, noBids, winRate, lossReasons: [{title, reason}], noBidReasons: [{title, reason}]},
  quarters: [{label, bids, wins}], cycleTimes: [{title, days}], avgCycleDays,
  portfolio: {activeContracts, totalValueCents, backlogCents, fundedCents, unfundedCents},
  deliverables: {total, onTime, late, timelinessPct},
  cparsTrend: [{period, rating, value}], calendar: [{date, label, kind}] }
```

### GET /api/settings → `{organization: {name, legalName, uei, cage, primaryNaics, targetAgency, pwinWeights, gateCriteria}, users: [{id, name, email, role, title, initials, mfaEnabled, active}], roleMatrix: [{role, permissions: {opportunities, pipeline, proposals, pricing, contracts, library, partners, reports, settings, audit}}], integrations: [{id, key, name, status, reason, detail}], aiGenerations: [{id, kind, target, accepted, createdAt, userName, sources}]}`
### PATCH /api/settings  `{name?} | {targetAgency?} | {pwinWeights: [{key,label,weight}]} | {gateCriteria: [...]} | {firstRunDone?}` (weights must sum to 100)

### GET /api/audit?limit= → `{entries: [{id, userName, userRole, action, entity, entityLabel, detail, createdAt}]}`

## Section assignments

| File | Export | Notes |
|---|---|---|
| sections/opportunities.tsx | OpportunitiesSection | list + detail drawer + track/dismiss/manual |
| sections/pipeline.tsx | PipelineSection | kanban + pursuit detail + gate modal |
| sections/proposals.tsx | ProposalsSection | list + workspace with tabs |
| sections/pricing.tsx | PricingSection | rate sets + working calculator |
| sections/contracts.tsx | ContractsSection | portfolio + contract detail with tabs |
| sections/library.tsx | LibrarySection | profile/past perf/resumes/content tabs |
| sections/partners.tsx | PartnersSection | directory + detail |
| sections/reports.tsx | ReportsSection | charts from live data |
| sections/settings.tsx | SettingsSection | profile/users/roles/integrations/audit tabs |
