import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCircleSummariesForUser, getCurrentUser, getOrCreateProfile } from "@/lib/data/app-data";

export default async function ProtectedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const displayName = typeof user.user_metadata.name === "string" ? user.user_metadata.name : null;
  const avatarUrl = typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const profile = await getOrCreateProfile(user.id, user.email ?? null, displayName, avatarUrl);
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
