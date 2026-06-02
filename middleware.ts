import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

const PUBLIC_FILE = /\.(.*)$/;

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/favicon.ico") ||
    PUBLIC_FILE.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return response;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isLogin = pathname.startsWith("/login");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isApi = pathname.startsWith("/api");

  if (!user) {
    if (isLogin || isApi) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const displayName =
    typeof user.user_metadata.name === "string"
      ? user.user_metadata.name
      : user.email?.split("@")[0] ?? "Vigil User";
  const avatarUrl = typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null;

  await supabase.from("users_profiles").upsert(
    {
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      phone: null,
      timezone: "UTC",
      notification_preferences: {}
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (!isOnboarding && !isApi) {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!count) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
