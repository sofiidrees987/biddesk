'use client'

import React, { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBidStore, SECTION_ORDER, type SectionKey } from '@/lib/biddesk/store'
import type { SessionUser, OrgProfile } from '@/components/biddesk/app'
import { LogoFull, LogoMark } from '@/components/biddesk/logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { toast } from '@/hooks/use-toast'
import {
  LayoutDashboard, Radar, KanbanSquare, FileText, Calculator, FolderKanban,
  LibraryBig, Users, BarChart3, Settings, Search, Bell, Sparkles, Moon, Sun,
  LogOut, ChevronDown, RotateCcw, Menu, X,
} from 'lucide-react'
import { CommandPalette } from '@/components/biddesk/command-palette'
import { NotificationsDrawer } from '@/components/biddesk/notifications-drawer'
import { AssistantPanel } from '@/components/biddesk/assistant-panel'
import { TourOverlay, TOUR_STEPS } from '@/components/biddesk/tour'
import { WelcomeDialog } from '@/components/biddesk/welcome'
import { DashboardSection } from '@/components/biddesk/sections/dashboard'
import { OpportunitiesSection } from '@/components/biddesk/sections/opportunities'
import { PipelineSection } from '@/components/biddesk/sections/pipeline'
import { ProposalsSection } from '@/components/biddesk/sections/proposals'
import { PricingSection } from '@/components/biddesk/sections/pricing'
import { ContractsSection } from '@/components/biddesk/sections/contracts'
import { LibrarySection } from '@/components/biddesk/sections/library'
import { PartnersSection } from '@/components/biddesk/sections/partners'
import { ReportsSection } from '@/components/biddesk/sections/reports'
import { SettingsSection } from '@/components/biddesk/sections/settings'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SECTION_ICONS: Record<SectionKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, opportunities: Radar, pipeline: KanbanSquare,
  proposals: FileText, pricing: Calculator, contracts: FolderKanban,
  library: LibraryBig, partners: Users, reports: BarChart3, settings: Settings,
}

export function AppShell({ user, org }: { user: SessionUser; org: OrgProfile | null }) {
  const { section, go, paletteOpen, setPaletteOpen, notificationsOpen, setNotificationsOpen,
    assistantOpen, setAssistantOpen, tourActive, welcomeOpen, setWelcomeOpen } = useBidStore()
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  // First-run: show welcome once
  useEffect(() => {
    if (org && !org.firstRunDone) setWelcomeOpen(true)
  }, [org, setWelcomeOpen])

  // Ctrl/Cmd+K opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await fetch('/api/notifications')).json(),
  })

  const markAllRead = useMutation({
    mutationFn: async () => fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const resetDemo = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/demo/reset', { method: 'POST' })
      if (!res.ok) throw new Error('Reset failed')
    },
    onSuccess: async () => {
      toast({ title: 'Demonstration workspace reset', description: 'All sample data restored to its initial state.' })
      window.location.href = '/'
    },
    onError: () => toast({ title: 'Reset failed', description: 'Try again in a moment.', variant: 'destructive' }),
  })

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const currentLabel = SECTION_ORDER.find((s) => s.key === section)?.label ?? ''

  const renderSection = () => {
    switch (section) {
      case 'dashboard': return <DashboardSection />
      case 'opportunities': return <OpportunitiesSection />
      case 'pipeline': return <PipelineSection />
      case 'proposals': return <ProposalsSection />
      case 'pricing': return <PricingSection />
      case 'contracts': return <ContractsSection />
      case 'library': return <LibrarySection />
      case 'partners': return <PartnersSection />
      case 'reports': return <ReportsSection />
      case 'settings': return <SettingsSection />
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Persistent demonstration banner */}
      <div className="shrink-0 bg-[var(--navy)] text-white/90 text-[11px] px-3 py-1 flex items-center justify-between gap-3 no-print">
        <span className="truncate">Interactive demonstration. All data shown is sample data.</span>
        <div className="flex items-center gap-2 shrink-0">
          {!tourActive ? (
            <button className="hover:underline" onClick={() => useBidStore.getState().startTour()}>Start walkthrough</button>
          ) : null}
          <span className="opacity-40">|</span>
          <button className="inline-flex items-center gap-1 hover:underline disabled:opacity-50" disabled={resetDemo.isPending} onClick={() => resetDemo.mutate()}>
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className={cn(
          'w-52 shrink-0 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] flex flex-col no-print',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:transition-transform max-lg:shadow-2xl',
          sidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        )}>
          <div className="h-12 flex items-center gap-2 px-3 border-b border-[var(--sidebar-border)]">
            <button className="flex items-center gap-2 focus-ring rounded" onClick={() => go('dashboard')} aria-label="Go to dashboard">
              <LogoMark size={22} />
              <LogoFull height={17} className="text-white [--logo-accent:#7BA9EC]" />
            </button>
            <button className="ml-auto lg:hidden text-white/70 hover:text-white" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto scroll-thin py-2 px-2" aria-label="Sections">
            {SECTION_ORDER.map((s) => {
              const Icon = SECTION_ICONS[s.key]
              const active = section === s.key
              return (
                <button key={s.key}
                  data-tour={`nav-${s.key}`}
                  onClick={() => { go(s.key); setSidebarOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium mb-0.5 transition-colors focus-ring',
                    active
                      ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                      : 'hover:bg-[var(--sidebar-accent)]/60 hover:text-white',
                  )}
                  aria-current={active ? 'page' : undefined}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </button>
              )
            })}
          </nav>
          <div className="border-t border-[var(--sidebar-border)] p-2">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white text-[11px] font-semibold">
                {user.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-white truncate">{user.name}</div>
                <div className="text-[10px] text-[var(--sidebar-foreground)] truncate">{user.role}</div>
              </div>
              <button onClick={signOut} className="text-[var(--sidebar-foreground)] hover:text-white focus-ring rounded" aria-label="Sign out">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
        {sidebarOpen ? <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden /> : null}

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="shrink-0 h-12 border-b bg-card flex items-center gap-2 px-3 no-print">
            <button className="lg:hidden focus-ring rounded" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </button>
            <h2 className="text-[13px] font-semibold px-1">{currentLabel}</h2>

            <button
              data-tour="global-search"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex items-center gap-2 h-8 w-40 md:w-64 rounded-md border bg-muted/60 px-2.5 text-[12px] text-muted-foreground hover:bg-muted focus-ring"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Search records…</span>
              <kbd className="ml-auto hidden md:inline-flex items-center gap-0.5 rounded border bg-card px-1 py-0.5 text-[10px] font-mono">Ctrl K</kbd>
            </button>

            <Button variant="ghost" size="icon" className="h-8 w-8 relative" aria-label="Notifications"
              data-tour="notifications"
              onClick={() => { setNotificationsOpen(true); if (notifications.data?.unread) markAllRead.mutate() }}>
              <Bell className="h-4 w-4" />
              {notifications.data?.unread ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--danger)]" aria-label={`${notifications.data.unread} unread`} />
              ) : null}
            </Button>

            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Toggle theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="h-4 w-4 hidden dark:block" />
            </Button>

            <Button size="sm" variant={assistantOpen ? 'default' : 'secondary'} className="h-8 gap-1.5 text-[12px]"
              data-tour="assistant"
              onClick={() => setAssistantOpen(!assistantOpen)}>
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Assistant</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted focus-ring" aria-label="User menu">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white text-[11px] font-semibold">
                    {user.initials}
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[12px]">
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[12px]" onClick={() => go('settings')}>Settings</DropdownMenuItem>
                <DropdownMenuItem className="text-[12px]" onClick={() => useBidStore.getState().startTour()}>Start walkthrough</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[12px]" onClick={signOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Content */}
          <main data-tour="content" className="flex-1 overflow-y-auto scroll-thin" id="main-content">
            <div className="p-4 md:p-6 max-w-[1500px] mx-auto">
              {renderSection()}
            </div>
          </main>
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} go={go} />
      <NotificationsDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <AssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} user={user} />
      <TourOverlay steps={TOUR_STEPS} />
      <WelcomeDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} org={org} user={user} />
    </div>
  )
}
