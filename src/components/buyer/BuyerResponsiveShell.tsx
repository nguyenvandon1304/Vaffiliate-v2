import type { ReactNode } from "react";

import { getCurrentUserAsync } from "@/lib/auth/server-guard";
import { isAdmin } from "@/lib/auth/roles";
import { adminNavItem } from "@/components/app/primaryNav";

import DesktopAppNav from "@/components/app/DesktopAppNav";
import BuyerMobileBottomNav from "./BuyerMobileBottomNav";
import BuyerMobileTopBar from "./BuyerMobileTopBar";

export type BuyerResponsiveShellProps = {
  /**
   * Mobile content frame. Pages supply the mobile-first version
   * of their layout here. On viewports >= 768px this content is
   * hidden so the desktop frame takes over.
   */
  readonly children: ReactNode;
  /**
   * Desktop content frame. Pages supply the publisher /
   * affiliate-shaped desktop layout here (the same content tree
   * that previously fed `AppShell.desktopContent`). On viewports
   * < 768px this content is hidden so the mobile frame takes
   * over.
   */
  readonly desktopContent: ReactNode;
  /**
   * Vietnamese title shown on the mobile top bar. When omitted
   * the top bar renders without the context chip.
   */
  readonly title?: string;
  /**
   * Optional alternative brand link destination. Defaults to
   * `/app`. Only override this when composing the shell for a
   * specific page (for example, a sub-shell inside a campaign
   * detail).
   */
  readonly brandHref?: string;
};

/**
 * Phase 20I.8 -- buyer responsive shell.
 *
 * Mirror of `src/components/app/ResponsiveAppShell.tsx`, but for
 * the buyer surface. The shell composes:
 *
 *   - a desktop publisher / affiliate sidebar (`DesktopAppNav`)
 *     on viewports >= 768px. The admin nav item is server-side
 *     filtered: a non-admin user never receives it in the
 *     rendered HTML.
 *   - a mobile-first buyer chrome (`BuyerMobileTopBar` +
 *     `BuyerMobileBottomNav`) on viewports < 768px.
 *
 * The shell preserves the existing publisher desktop sidebar so
 * the affiliate flow stays reachable from a wide viewport; on
 * mobile the shell replaces the publisher mobile chrome with
 * the buyer chrome so the five-item buyer navigation is the
 * visible primary navigation.
 *
 * The shell is opt-in. Pages that do not wrap themselves in
 * `<BuyerResponsiveShell>` keep their existing
 * `ResponsiveAppShell` (publisher chrome on both mobile and
 * desktop). Admin routes are NOT wrapped -- they continue to
 * render the `va-admin-shell` chrome from
 * `src/app/app/admin/layout.tsx`. The buyer bottom nav never
 * appears on `/app/admin/**` because the admin layout does not
 * compose `BuyerResponsiveShell`.
 */
export const dynamic = "force-dynamic";

export default async function BuyerResponsiveShell({
  children,
  desktopContent,
  title,
  brandHref = "/app",
}: BuyerResponsiveShellProps) {
  const actor = await getCurrentUserAsync();
  const showAdminNav = isAdmin(actor?.role ?? null);
  const extraNavItems = showAdminNav ? [adminNavItem] : [];

  return (
    <main
      data-testid="buyer-responsive-shell"
      data-shell-variant="buyer"
      className="app-mobile-bg flex min-h-screen flex-col bg-[color:var(--background)]"
    >
      <div className="responsive-app-shell page-shell md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
        <DesktopAppNav extraAdvancedItems={extraNavItems} />

        <div className="md:hidden">
          <div className="phone-preview">
            <div className="mobile-shell">
              <BuyerMobileTopBar title={title} brandHref={brandHref} />
              {children}
            </div>
            <BuyerMobileBottomNav />
          </div>
        </div>

        <div className="hidden md:block">{desktopContent}</div>
      </div>
    </main>
  );
}
