export type RailIconName =
  | 'map'
  | 'search'
  | 'detail'
  | 'layers'
  | 'development'
  | 'facility'

export function DashboardRailIcon({ name }: { name: RailIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === 'map' && (
        <>
          <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" />
          <path d="M9 4v14M15 6v14" />
        </>
      )}
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 4.5 4.5" />
        </>
      )}
      {name === 'detail' && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
      {name === 'layers' && (
        <>
          <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
          <path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
        </>
      )}
      {name === 'development' && (
        <>
          <path d="M4 19V8l5-3 6 3 5-3v11l-5 3-6-3-5 3Z" />
          <path d="M9 5v11M15 8v11" />
        </>
      )}
      {name === 'facility' && (
        <>
          <path d="M4 20V9l8-5 8 5v11H4Z" />
          <path d="M9 20v-6h6v6M8 10h.01M12 10h.01M16 10h.01" />
        </>
      )}
    </svg>
  )
}
