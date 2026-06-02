import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getCurrentUser, getOrCreateProfile } from "@/lib/data/app-data";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const profile = await getOrCreateProfile(user.id, user.email ?? null);

  return <DashboardView profile={profile} />;
}
