import Badge from "@/components/ui/Badge";
import type { ClickItem } from "@/types/click";

function formatCreatedAt(value: string): string {
  const [datePart, timePart = ""] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  const [hour, minute] = timePart.split(":");
  const time = hour && minute ? ` ${hour}:${minute}` : "";
  return `${day}/${month}/${year}${time}`;
}

export default function ClickTable({ clicks }: { clicks: ClickItem[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {clicks.map((click) => (
          <article
            key={click.id}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{click.trackingCode}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {formatCreatedAt(click.createdAt)}
                </p>
              </div>
              {click.isUnique ? (
                <Badge variant="success">Lượt nhấp duy nhất</Badge>
              ) : (
                <Badge variant="neutral">Lặp lại</Badge>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {click.platform}
              </span>
              <Badge variant="neutral">{click.trackingCode}</Badge>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
