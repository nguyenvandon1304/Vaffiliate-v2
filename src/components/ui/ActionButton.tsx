import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function ActionButton({
  children,
  tone = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "default" | "secondary";
}) {
  const toneClasses =
    tone === "secondary"
      ? "border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.86)] shadow-[var(--shadow-sm)]"
      : "bg-[color:var(--brand)] text-white shadow-[var(--shadow-sm)]";

  return (
    <button
      {...props}
      className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${toneClasses} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
