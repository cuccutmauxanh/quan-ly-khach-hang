export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}

export function PageSkeleton() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f7f4' }}>
      {/* Sidebar skeleton */}
      <div style={{ width: 224, background: '#fff', borderRight: '1px solid #e8e3d9', flexShrink: 0 }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0ece3' }}>
          <Skeleton className="h-10 w-36" />
        </div>
        <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
      {/* Content skeleton */}
      <main style={{ flex: 1, padding: '28px 32px' }}>
        <Skeleton className="h-8 w-56 mb-6" />
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48 mb-5" />
        <Skeleton className="h-64" />
      </main>
    </div>
  )
}
