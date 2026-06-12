import type { ReactNode } from "react";

export default function AppSection({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={className}>{children}</section>;
}
