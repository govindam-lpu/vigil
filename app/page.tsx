import { redirect } from "next/navigation";
import { getCircleSummariesForUser, getCurrentUser } from "@/lib/data/app-data";

// Landing redirect: multiple care circles → the workspace picker; a single circle
// goes straight to its dashboard (DESIGN — Workspace Selection). No circles → onboarding.
export default async function HomePage() {
  const user = await getCurrentUser();
  const circles = await getCircleSummariesForUser(user.id);

  if (circles.length === 0) {
    redirect("/onboarding");
  }

  if (circles.length > 1) {
    redirect("/workspaces");
  }

  redirect("/dashboard");
}
