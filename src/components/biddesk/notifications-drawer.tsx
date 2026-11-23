'use client'

import { useQuery } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBidStore, type SectionKey } from '@/lib/biddesk/store'
import { fmtRelative } from '@/lib/biddesk/format'
import { Bell, CalendarClock, ClipboardCheck, FileText, GitBranch, Star, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type Notification = {
  id: string; kind: string; title: string; body: string
  recordType: string; recordId: string; read: boolean; createdAt: string
}

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deadline: CalendarClock, review: ClipboardCheck, option: GitBranch,
  cpars: Star, match: Star, assignment: FileText, system: TriangleAlert,
}

const RECORD_SECTIONS: Record<string, SectionKey> = {
  proposal: 'proposals', pursuit: 'pipeline', contract: 'contracts',
  opportunity: 'opportunities', settings: 'settings',
}

export function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const go = useBidStore((s) => s.go)
  const { data } = useQuery<{ notifications: Notification[]; unread: number }>({
    queryKey: ['notifications'],
    queryFn: async () => (await fetch('/api/notifications')).json(),
    enabled: open,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b">
          <SheetTitle className="text-[15px] flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            Deadlines, reviews, option windows, and match alerts. Email delivery activates when SMTP is configured in Settings.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col divide-y">
            {data?.notifications?.map((n) => {
              const Icon = KIND_ICONS[n.kind] ?? Bell
              const rel = fmtRelative(n.createdAt)
              return (
                <button key={n.id}
                  className="flex gap-3 p-4 text-left hover:bg-muted/60 transition-colors"
                  onClick={() => {
                    const section = RECORD_SECTIONS[n.recordType]
                    if (section && n.recordId) {
                      onOpenChange(false)
                      go(section, { id: n.recordId })
                    }
                  }}>
                  <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    n.read ? 'bg-muted text-muted-foreground' : 'bg-[var(--info-bg)] text-[var(--info)]')}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('text-[13px] leading-5', n.read ? 'font-normal' : 'font-semibold')}>{n.title}</span>
                      <span className="tnum text-[10px] text-muted-foreground whitespace-nowrap">{rel.text}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground leading-4 line-clamp-3">{n.body}</p>
                  </div>
                </button>
              )
            })}
            {!data?.notifications?.length ? (
              <div className="p-8 text-center text-[13px] text-muted-foreground">
                No notifications. Deadlines, review requests, and option windows will appear here.
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
