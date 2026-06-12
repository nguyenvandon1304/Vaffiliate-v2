import { moreMenuItems } from "@/lib/mock-data";

export default function MoreMenuGrid() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)]">
      {moreMenuItems.map((item) => (
        <div
          key={item.title}
          className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]"
        >
          <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            {item.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
}
