'use client'

import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/biddesk/shell'
import { SignIn } from '@/components/biddesk/sign-in'
import { Skeleton } from '@/components/ui/skeleton'

export type SessionUser = {
  id: string
  orgId: string
  email: string
  name: string
  role: string
  title: string
  initials: string
  mfaEnabled: boolean
}

export type OrgProfile = {
  id: string
  name: string
  legalName: string
  uei: string
  cage: string
  samExpiry: string | null
  primaryNaics: string
  naicsList: string[]
  sizeStandard: string
  certifications: { name: string; expiry?: string }[]
  vehicles: { name: string; number: string }[]
  facilityClearance: string
  dcaaStatus: string
  sprsScore: number | null
  sprsDate: string | null
  targetAgency: string
  firstRunDone: boolean
  walkthroughSeen: boolean
  pwinWeights: { key: string; label: string; weight: number }[]
  gateCriteria: { key: string; label: string; weight: number }[]
}

export function useSession() {
  return useQuery<{ user: SessionUser; org: OrgProfile | null }>({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/session')
      if (!res.ok) throw new Error('No session')
      return res.json()
    },
    retry: false,
    staleTime: 60_000,
  })
}

export function BidDeskApp() {
  const { data, isLoading, error } = useSession()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    )
  }

  if (error || !data) return <SignIn />
  return <AppShell user={data.user} org={data.org} />
}
