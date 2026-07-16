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

  // API routes authenticate themselves (and, unlike Server Components, route handlers
  // CAN persist a refreshed session cookie). Running getUser() here too added a full
  // Supabase Auth round-trip to every single API call for nothing.
  if (pathname.startsWith("/api")) {
    return response;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isLogin = pathname.startsWith("/login");

  if (!user) {
    if (isLogin) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Profile creation is handled once on entry by the (app) layout's getOrCreateProfile —
  // no per-request write here (this middleware runs on every navigation and every API call).
  if (isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // The zero-circle → /onboarding redirect lives in the (app) layout (which already loads
  // the user's circles on entry). Doing it here too cost a memberships COUNT round-trip on
  // every navigation and every API call — removed to speed up tab switching.
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
