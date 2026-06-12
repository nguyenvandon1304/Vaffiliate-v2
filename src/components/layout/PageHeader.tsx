import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        {eyebrow}
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>
      </div>
      {trailing}
    </div>
  );
}
