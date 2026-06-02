import type { Role } from "@/lib/types";

export const ROLE_RANK: Record<Role, number> = {
  emergency: 0,
  viewer: 1,
  caregiver: 2,
  contributor: 3,
  coordinator: 4,
  owner: 5
};

export function roleMeetsMinimum(role: Role, minimumRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    owner: "Owner",
    coordinator: "Coordinator",
    contributor: "Contributor",
    caregiver: "Caregiver",
    viewer: "Viewer",
    emergency: "Emergency"
  };

  return labels[role];
}
