import type { CircleSummary, UserProfile } from "@/lib/types";
import { ActiveCircleProvider } from "./active-circle-provider";
import { ShellBanners } from "./crisis-banner";
import { CrisisModeProvider } from "./crisis-mode-provider";
import { MobileNav } from "./mobile-nav";
import { ServiceWorkerRegister } from "./service-worker-register";
import { ShellMain } from "./shell-main";
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
      <CrisisModeProvider>
        <ServiceWorkerRegister />
        <TopBar profile={profile} email={email} />
        <ShellBanners />
        <Sidebar />
        <MobileNav />
        <ShellMain>{children}</ShellMain>
      </CrisisModeProvider>
    </ActiveCircleProvider>
  );
}
