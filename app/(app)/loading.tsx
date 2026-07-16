import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

// Route-transition skeleton. Because every (app) route is dynamic (the layout reads
// auth cookies), Next prefetches only up to this boundary — without it a tab click
// showed NOTHING until the whole server render round-tripped. With it, the click
// swaps to this skeleton immediately and the page streams in behind it.
export default function AppRouteLoading() {
  return (
    <div className="mx-auto max-w-[1280px] p-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between border-b border-neutral-200 py-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="mt-5">
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}
