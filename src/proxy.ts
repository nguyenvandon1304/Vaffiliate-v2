/**
 * Phase 20I.5 -- Next.js 16 Proxy entry point.
 *
 * In Next.js 16 the file is `proxy.ts` (formerly `middleware.ts`).
 * The Proxy runs on the edge runtime and is the right place for
 * an optimistic check that protects the SEO-cheap public routes
 * from ever touching the Supabase client.
 *
 * Important caveats from the Next.js docs:
 *
 *   - Proxy is meant for OPTIMISTIC checks, not full session /
 *     authorization enforcement. The real, fail-closed guard is
 *     in `src/app/app/layout.tsx` and `src/app/app/admin/layout.tsx`
 *     which call `requireUser()` / `requireAdmin()` on every render.
 *   - Proxy MUST NOT use shared globals or module-level state
 *     because the runtime may invoke it in a CDN-style worker.
 *     This file does not import any module-level mutable state.
 *
 * The matcher excludes static files / image optimisations / the
 * `/go/<shortCode>` redirect endpoint so the proxy does not
 * block tracking-link clicks or the next asset bundle.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  isProtectedRoute,
} from "@/lib/auth/route-classification";
import { updateSession } from "@/lib/supabase/proxy";

export const config = {
  matcher: [
    // Run on every request except static assets, the Supabase
    // auth callback, the next image optimisation endpoint,
    // the tracking-link redirect, and the favicon.
    "/((?!_next/static|_next/image|go/|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Public routes never need a session round trip.
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next({ request });
  }

  // For protected routes delegate to the existing session refresher.
  // `updateSession()` is the same helper that was previously sitting
  // in `src/lib/supabase/proxy.ts` unused; it reads the cookies, asks
  // Supabase for the claims, and either redirects unauthenticated
  // callers to /login or refreshes the response cookies.
  return updateSession(request);
}
