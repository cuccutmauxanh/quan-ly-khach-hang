export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav skeleton */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-1">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-20" />)}
        </div>
      </div>
      {/* Content skeleton */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </main>
    </div>
  )
}
