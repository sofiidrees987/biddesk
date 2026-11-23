'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import type { SectionKey } from '@/lib/biddesk/store'
import { SECTION_ORDER } from '@/lib/biddesk/store'
import { useBidStore } from '@/lib/biddesk/store'
import {
  LayoutDashboard, Radar, KanbanSquare, FileText, Calculator, FolderKanban,
  LibraryBig, Users, BarChart3, Settings, CornerDownLeft,
} from 'lucide-react'

type SearchResult = { type: string; id: string; title: string; subtitle: string; section: SectionKey }

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, opportunities: Radar, pipeline: KanbanSquare,
  proposals: FileText, pricing: Calculator, contracts: FolderKanban,
  library: LibraryBig, partners: Users, reports: BarChart3, settings: Settings,
}

export function CommandPalette({ open, onOpenChange, go }: { open: boolean; onOpenChange: (o: boolean) => void; go: (s: SectionKey, params?: Record<string, string>) => void }) {
  const [q, setQ] = useState('')
  const startTour = useBidStore((s) => s.startTour)

  const search = useQuery<{ results: SearchResult[] }>({
    queryKey: ['search', q],
    queryFn: async () => (await fetch('/api/search?q=' + encodeURIComponent(q))).json(),
    enabled: open && q.trim().length > 0,
  })

  const handleOpenChange = (o: boolean) => {
    if (!o) setQ('')
    onOpenChange(o)
  }

  const navigate = (section: SectionKey, params?: Record<string, string>) => {
    onOpenChange(false)
    go(section, params)
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search opportunities, pursuits, proposals, contracts…" />
      <CommandList className="scroll-thin">
        <CommandEmpty>
          {q ? 'No records match your search.' : 'Type to search across all records.'}
        </CommandEmpty>

        {!q ? (
          <CommandGroup heading="Go to section">
            {SECTION_ORDER.map((s) => {
              const Icon = SECTION_ICONS[s.key]
              return (
                <CommandItem key={s.key} value={`go-${s.label}`} onSelect={() => navigate(s.key)}>
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{s.label}</span>
                  <CornerDownLeft className="ml-auto h-3 w-3 text-muted-foreground" />
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}

        {q && search.data?.results?.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Records">
              {search.data.results.map((r) => (
                <CommandItem key={`${r.type}-${r.id}`} value={`${r.title} ${r.subtitle}`}
                  onSelect={() => navigate(r.section, r.type === 'opportunity' ? { id: r.id } : r.type === 'pursuit' ? { id: r.id } : r.type === 'proposal' ? { id: r.id } : r.type === 'contract' ? { id: r.id } : undefined)}>
                  <span className="mr-2 w-4 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                    {r.type.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{r.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {!q ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Guided walkthrough">
              <CommandItem value="start-walkthrough" onSelect={() => { onOpenChange(false); startTour() }}>
                <Radar className="mr-2 h-4 w-4 text-muted-foreground" />
                Start the product walkthrough
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
