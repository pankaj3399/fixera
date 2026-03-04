import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  )
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-5 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
}

function SkeletonTable({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background overflow-hidden", className)}>
      <div className="flex gap-4 p-4 border-b border-border bg-muted/50">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 p-4 border-b border-border last:border-0">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function SkeletonAvatar({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" }
  return <Skeleton className={cn(sizes[size], "rounded-full", className)} />
}

function SkeletonButton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-24 rounded-lg", className)} />
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonAvatar, SkeletonButton }
