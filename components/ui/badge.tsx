import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "primary" | "green" | "yellow" | "red" | "orange";

const variants: Record<BadgeVariant, string> = {
  neutral: "border-neutral-200 bg-neutral-100 text-neutral-700",
  primary: "border-blue-100 bg-blue-50 text-blue-600",
  green: "border-green-100 bg-green-50 text-green-700",
  yellow: "border-yellow-100 bg-yellow-50 text-yellow-700",
  red: "border-red-100 bg-red-50 text-red-700",
  orange: "border-orange-100 bg-orange-50 text-orange-700"
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-1 text-[12px] font-medium leading-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
