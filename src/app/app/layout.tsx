/**
 * Phase 20I.5 -- shared `/app/**` layout with server-side auth guard.
 *
 * The layout is the canonical guard for every user-facing route
 * under `/app`. Every page under this segment inherits the guard
 * automatically because Next.js wraps each page with the closest
 * ancestor `layout.tsx`. Pages that need their own role check
 * (admin pages) extend this by adding a deeper `layout.tsx` that
 * calls `requireAdmin()`.
 *
 * Why a layout and not just a page-level check:
 *
 *   - Any new `/app/**` route added later gets the guard for free.
 *   - The check is server-side: there is no client-side bypass.
 *   - The redirect to `/login?next=...` is consistent across
 *     every protected route.
 *
 * This layout does NOT render the buyer-facing chrome; the
 * individual user pages continue to use `AppShell` themselves.
 * The layout's only job is to enforce the auth gate.
 */

import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth/server-guard";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The redirect is thrown synchronously, so any `children` only
  // renders when the user is authenticated. We pass `nextPath` so
  // the user is sent back to the page they originally requested.
  await requireUser("/app");

  return <>{children}</>;
}
