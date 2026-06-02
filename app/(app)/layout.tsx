import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCircleSummariesForUser, getCurrentUser, getOrCreateProfile } from "@/lib/data/app-data";

export default async function ProtectedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const profile = await getOrCreateProfile(user.id, user.email ?? null);
  const circles = await getCircleSummariesForUser(user.id);

  if (circles.length === 0) {
    redirect("/onboarding");
  }

  return (
    <AppShell circles={circles} profile={profile} email={user.email ?? ""}>
      {children}
    </AppShell>
  );
}
