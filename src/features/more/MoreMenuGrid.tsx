import Link from "next/link";
import type { MoreMenuItem } from "@/types/user";

type MoreMenuGridProps = {
  items: MoreMenuItem[];
};

const cardClassName =
  "rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]";

export default function MoreMenuGrid({ items }: MoreMenuGridProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)]">
      {items.map((item) => {
        const content = (
          <>
            <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {item.subtitle}
            </p>
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.title}
              href={item.href}
              className={`${cardClassName} block transition-colors hover:border-[color:var(--brand)] hover:bg-[rgba(255,250,246,0.96)]`}
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={item.title} className={cardClassName}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
