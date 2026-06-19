import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "neutral" | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]",
  success: "bg-[rgba(47,143,97,0.14)] text-[color:var(--success)]",
  warning: "bg-[rgba(220,157,67,0.14)] text-[color:var(--warning)]",
  neutral: "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)]",
  danger: "bg-[rgba(220,71,71,0.1)] text-[color:#c44536]",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${variantClasses[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
