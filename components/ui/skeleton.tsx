import { cn } from "@/lib/utils";

// Loading placeholder. Render while a fetch is in flight so views never flash an
// empty/"not found" state before data resolves (distinguish loading from empty).
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-neutral-200/70", className)} aria-hidden="true" />;
}

// Convenience: a stack of card-height skeleton rows.
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
