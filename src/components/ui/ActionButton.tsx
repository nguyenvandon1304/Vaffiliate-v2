import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary";
};

export default function ActionButton({ tone = "primary", className = "", ...props }: Props) {
  const base =
    "rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5";
  const toneClasses =
    tone === "primary"
      ? "bg-[color:var(--brand)] text-white"
      : "border border-[rgba(124,63,44,0.12)] bg-white/80 text-[color:var(--text)]";

  return <button className={`${base} ${toneClasses} ${className}`.trim()} {...props} />;
}
