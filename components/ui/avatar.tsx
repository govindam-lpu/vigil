import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, getInitials } from "@/lib/utils";

type AvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
};

export function Avatar({ name, src, className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-100 bg-brand-50",
        className
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className="text-sm font-semibold text-brand-700">
        {getInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
