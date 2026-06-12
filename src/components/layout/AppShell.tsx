import type { ReactNode } from "react";
import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";

export default function AppShell({
  desktopContent,
  children,
}: {
  desktopContent: ReactNode;
  children: ReactNode;
}) {
  return <ResponsiveAppShell desktopContent={desktopContent}>{children}</ResponsiveAppShell>;
}
