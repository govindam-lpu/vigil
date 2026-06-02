"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { roleLabel } from "@/lib/permissions/roles";
import { formatPersonName } from "@/lib/utils";
import { useActiveCircle } from "./active-circle-provider";

export function PersonSwitcher() {
  const router = useRouter();
  const { circles, activeCircle, setActiveCareCircleId } = useActiveCircle();

  const activePerson = activeCircle?.person;
  const activeName = activePerson
    ? formatPersonName(activePerson.first_name, activePerson.last_name, activePerson.preferred_name)
    : "No person selected";

  if (circles.length <= 1) {
    return (
      <div className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700">
        {activeName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        {activeName}
        <ChevronDown className="h-4 w-4 text-neutral-500" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        {circles.map((circle) => {
          const person = circle.person;
          const personName = person
            ? formatPersonName(person.first_name, person.last_name, person.preferred_name)
            : circle.careCircle.name;

          return (
            <DropdownMenuItem
              key={circle.careCircle.id}
              onSelect={() => {
                setActiveCareCircleId(circle.careCircle.id);
                router.refresh();
              }}
              className="h-auto items-start justify-between gap-3 py-2"
            >
              <span className="font-medium text-neutral-900">{personName}</span>
              <Badge variant="primary">{roleLabel(circle.membership.role)}</Badge>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1 h-px bg-neutral-200" />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")} className="text-blue-600">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Care Circle
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
