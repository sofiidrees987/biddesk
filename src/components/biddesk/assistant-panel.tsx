'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useBidStore } from '@/lib/biddesk/store'
import { cn } from '@/lib/utils'
import { Sparkles, Send, BookOpen, CornerDownLeft, Loader2 } from 'lucide-react'

type Source = { id: string; type: string; ref: string; title: string }
type Message = {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  engine?: string
}

const SUGGESTED = [
  'What is our pipeline worth right now?',
  'Which proposal is due next and how is its compliance coverage?',
  'What contract actions need attention this month?',
  'What are our best opportunity matches?',
]

const SECTION_QUESTIONS: Record<string, string[]> = {
  opportunities: ['What are our best opportunity matches?', 'Why did we dismiss the records management notice?'],
  pipeline: ['What is our pipeline worth right now?', 'Which pursuit has the highest PWin?'],
  proposals: ['Which proposal is due next and how is its compliance coverage?', 'What review findings are still open?'],
  pricing: ['How are our loaded rates built up?', 'What is the sensitivity of the price to fee changes?'],
  contracts: ['What contract actions need attention this month?', 'When is the next option exercise due?'],
  library: ['What past performance is approved for use in drafting?'],
  partners: ['Which partners have executed teaming agreements?'],
  reports: ['What is our win rate this year?'],
  settings: ['Which integrations need credentials?'],
}

export function AssistantPanel({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: { name: string; role: string } }) {
  const { assistantContext } = useBidStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          section: assistantContext.section,
          recordType: assistantContext.recordType,
          recordId: assistantContext.recordId,
        }),
      })
      if (!res.ok) throw new Error('The Assistant could not answer right now.')
      return res.json() as Promise<{ answer: string; sources: Source[]; engine: string }>
    },
    onMutate: (question) => {
      setMessages((m) => [...m, { role: 'user', text: question }])
      setBusy(true)
    },
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: 'assistant', text: data.answer, sources: data.sources, engine: data.engine }])
    },
    onError: (e) => {
      setMessages((m) => [...m, { role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.' }])
    },
    onSettled: () => setBusy(false),
  })

  const suggestions = SECTION_QUESTIONS[assistantContext.section] ?? SUGGESTED

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b">
          <SheetTitle className="text-[15px] flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" /> Assistant
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            Answers are grounded in your records and show their sources. Drafts always require human acceptance.
          </SheetDescription>
        </SheetHeader>

        <div ref={listRef} className="flex-1 overflow-y-auto scroll-thin p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-[12px] text-muted-foreground leading-5">
                Ask about your pipeline, proposals, compliance coverage, contracts, options, or opportunity matches.
                Suggested questions for the <span className="font-medium text-foreground">{assistantContext.section}</span> section:
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((q) => (
                  <button key={q}
                    className="group flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-left text-[12.5px] hover:border-[var(--brand)] hover:bg-accent/50 transition-colors"
                    onClick={() => ask.mutate(q)}>
                    <span>{q}</span>
                    <CornerDownLeft className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex flex-col gap-1', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div className={cn(
                'max-w-[92%] rounded-lg px-3 py-2 text-[12.5px] leading-5 whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-[var(--navy)] text-white dark:bg-[var(--brand)] dark:text-white rounded-br-sm'
                  : 'bg-card border rounded-bl-sm',
              )}>
                {m.text}
              </div>
              {m.role === 'assistant' && m.sources?.length ? (
                <div className="flex flex-wrap gap-1 max-w-[92%]">
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <BookOpen className="h-3 w-3" /> Sources:
                  </span>
                  {m.sources.map((s) => (
                    <span key={s.id} className="pill pill-info" title={s.title}>
                      {s.ref.slice(0, 24)}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.role === 'assistant' && m.engine ? (
                <span className="text-[10px] text-muted-foreground">
                  {m.engine === 'assistant' ? 'Answered from your records via the Assistant' : 'Answered directly from your records'}
                </span>
              ) : null}
            </div>
          ))}

          {busy ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reviewing records…
            </div>
          ) : null}
        </div>

        <form
          className="border-t p-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const q = input.trim()
            if (q && !busy) {
              ask.mutate(q)
              setInput('')
            }
          }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about your ${assistantContext.section} records…`}
            className="flex-1 h-9 rounded-md border bg-card px-3 text-[13px] focus-ring"
            disabled={busy}
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="px-3 pb-2 text-[10px] text-muted-foreground">
          Signed in as {user.name}. The Assistant uses the same permissions you have.
        </div>
      </SheetContent>
    </Sheet>
  )
}
