'use client'

import { create } from 'zustand'

export type SectionKey =
  | 'dashboard' | 'opportunities' | 'pipeline' | 'proposals' | 'pricing'
  | 'contracts' | 'library' | 'partners' | 'reports' | 'settings'

export type AssistantContext = {
  section: SectionKey
  recordType?: string
  recordId?: string
  recordLabel?: string
}

type BidDeskState = {
  section: SectionKey
  /** Per-section navigation parameters (selected record ids, tabs). */
  params: Partial<Record<SectionKey, Record<string, string>>>
  paletteOpen: boolean
  notificationsOpen: boolean
  assistantOpen: boolean
  assistantContext: AssistantContext
  tourActive: boolean
  tourStep: number
  welcomeOpen: boolean
  /** Set a section (optionally with params, e.g. {id: proposalId}). */
  go: (section: SectionKey, params?: Record<string, string>) => void
  setParam: (section: SectionKey, key: string, value: string) => void
  setPaletteOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean) => void
  setAssistantOpen: (open: boolean) => void
  setAssistantContext: (ctx: AssistantContext) => void
  startTour: () => void
  endTour: () => void
  setTourStep: (n: number) => void
  setWelcomeOpen: (open: boolean) => void
}

export const useBidStore = create<BidDeskState>((set) => ({
  section: 'dashboard',
  params: {},
  paletteOpen: false,
  notificationsOpen: false,
  assistantOpen: false,
  assistantContext: { section: 'dashboard' },
  tourActive: false,
  tourStep: 0,
  welcomeOpen: false,
  go: (section, params) =>
    set((s) => ({
      section,
      params: params ? { ...s.params, [section]: params } : s.params,
      paletteOpen: false,
    })),
  setParam: (section, key, value) =>
    set((s) => ({
      params: { ...s.params, [section]: { ...(s.params[section] ?? {}), [key]: value } },
    })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
  setAssistantContext: (ctx) => set({ assistantContext: ctx }),
  startTour: () => set({ tourActive: true, tourStep: 0 }),
  endTour: () => set({ tourActive: false, tourStep: 0 }),
  setTourStep: (n) => set({ tourStep: n }),
  setWelcomeOpen: (open) => set({ welcomeOpen: open }),
}))

export const SECTION_ORDER: { key: SectionKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'library', label: 'Library' },
  { key: 'partners', label: 'Partners' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
]
