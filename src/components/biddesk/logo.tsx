'use client'

/** BidDesk logo components — the flat geometric mark: rounded square, folded-corner page, check mark. */

export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#12263F" />
      <path d="M10 7.5h8.2L23.5 12.8V24.5H10z" fill="#FFFFFF" />
      <path d="M18.2 7.5v5.3h5.3z" fill="#C9D4E3" />
      <path d="M12.8 17.2l3.2 3.2 5.6-5.9" fill="none" stroke="#1F6FEB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LogoFull({ height = 26, className = '' }: { height?: number; className?: string }) {
  return (
    <svg height={height} viewBox="0 0 190 32" className={className} role="img" aria-label="BidDesk">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#12263F" />
      <path d="M10 7.5h8.2L23.5 12.8V24.5H10z" fill="#FFFFFF" />
      <path d="M18.2 7.5v5.3h5.3z" fill="#C9D4E3" />
      <path d="M12.8 17.2l3.2 3.2 5.6-5.9" fill="none" stroke="#1F6FEB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="40" y="26" fontSize="27" fontWeight="700" letterSpacing="-0.6"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
        fill="currentColor">Bid<tspan fill="var(--logo-accent, #7BA9EC)">Desk!</tspan></text>
    </svg>
  )
}
