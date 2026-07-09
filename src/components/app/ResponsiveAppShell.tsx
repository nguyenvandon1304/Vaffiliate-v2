import type { ReactNode } from "react";

import { getCurrentUserAsync } from "@/lib/auth/server-guard";
import { isAdmin } from "@/lib/auth/roles";
import { adminNavItem } from "./primaryNav";

import DesktopAppNav from "./DesktopAppNav";
import MobileBottomNav from "../mobile/MobileBottomNav";
import MobileTopBar from "../mobile/MobileTopBar";

type ResponsiveAppShellProps = {
  children: ReactNode;
  desktopContent?: ReactNode;
};

/**
 * Phase 20I.5 -- the shell is a server component. It reads the
 * current user from the Supabase session and decides whether to
 * surface the admin nav item. The decision is server-side: a
 * non-admin user never receives the admin link in the rendered
 * HTML, so a view-source attack cannot reveal it.
 */
export default async function ResponsiveAppShell({
  children,
  desktopContent,
}: ResponsiveAppShellProps) {
  // Read the user without throwing -- if the session is missing
  // the `/app/**` layout guard has already redirected, so this
  // path is only hit by an authenticated user.
  const actor = await getCurrentUserAsync();
  const showAdminNav = isAdmin(actor?.role ?? null);
  const extraNavItems = showAdminNav ? [adminNavItem] : [];

  return (
    <main className="app-mobile-bg min-h-screen px-0 py-0 md:px-6 md:py-6 xl:px-8">
      <div className="responsive-app-shell page-shell md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
        <DesktopAppNav extraAdvancedItems={extraNavItems} />

        <div className="md:hidden">
          <div className="phone-preview">
            <div className="mobile-shell">
              <MobileTopBar />
              {children}
            </div>

            <MobileBottomNav />
          </div>
        </div>

        <div className="hidden md:block">{desktopContent ?? children}</div>
      </div>
    </main>
  );
}
