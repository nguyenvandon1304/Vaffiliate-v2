import type { ReactNode } from "react";
import DesktopAppNav from "./DesktopAppNav";
import MobileBottomNav from "../mobile/MobileBottomNav";
import MobileTopBar from "../mobile/MobileTopBar";

type ResponsiveAppShellProps = {
  children: ReactNode;
  desktopContent?: ReactNode;
};

export default function ResponsiveAppShell({
  children,
  desktopContent,
}: ResponsiveAppShellProps) {
  return (
    <main className="app-mobile-bg min-h-screen px-0 py-0 md:px-6 md:py-6 xl:px-8">
      <div className="responsive-app-shell page-shell md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
        <DesktopAppNav />

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
