import type { CircleSummary, UserProfile } from "@/lib/types";
import { ActiveCircleProvider } from "./active-circle-provider";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  circles: CircleSummary[];
  profile: UserProfile;
  email: string;
  children: React.ReactNode;
};

export function AppShell({ circles, profile, email, children }: AppShellProps) {
  return (
    <ActiveCircleProvider circles={circles}>
      <TopBar profile={profile} email={email} />
      <Sidebar />
      <main className="min-h-screen bg-neutral-50 pt-14 lg:pl-60">{children}</main>
    </ActiveCircleProvider>
  );
}
