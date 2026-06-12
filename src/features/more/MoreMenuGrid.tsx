import { moreMenuItems } from "@/lib/mock-data";

export default function MoreMenuGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
      {moreMenuItems.map((item) => (
        <button
          key={item.title}
          type="button"
          className="flex min-h-[148px] flex-col justify-between rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 text-left shadow-[var(--shadow-sm)]"
        >
          <div>
            <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {item.subtitle}
            </p>
          </div>
          <span className="mt-4 text-sm font-semibold text-[color:var(--brand-strong)]">
            Mở mục →
          </span>
        </button>
      ))}
    </div>
  );
}
