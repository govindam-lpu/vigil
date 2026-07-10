import { cn } from "@/lib/utils";

// The Vigil wordmark: the person voice (Literata) plus the ember — the lamp
// that says someone is keeping watch (DESIGN.md — Visual Identity).
type WordmarkProps = {
  className?: string;
  pulse?: boolean;
};

export function Wordmark({ className, pulse = true }: WordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 font-display font-semibold tracking-tight",
        className
      )}
    >
      Vigil
      <span className={cn("ember-dot", pulse && "ember-pulse")} aria-hidden="true" />
    </span>
  );
}
