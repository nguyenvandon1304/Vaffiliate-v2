import Badge from "@/components/ui/Badge";
import type { CashbackHistoryItem } from "@/types/cashback";

type BadgeVariant = "default" | "success" | "warning" | "neutral";

const statusLabels: Record<CashbackHistoryItem["status"], string> = {
  pending: "Đang chờ",
  approved: "Đã duyệt",
  paid: "Đã thanh toán",
};

const statusVariants: Record<CashbackHistoryItem["status"], BadgeVariant> = {
  pending: "warning",
  approved: "success",
  paid: "default",
};

export default function CashbackHistoryTable({ history }: { history: CashbackHistoryItem[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {history.map((item) => (
          <article
            key={item.id}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {item.date}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--success)]">{item.amount}</p>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {item.platform}
              </span>
              <Badge variant={statusVariants[item.status]}>{statusLabels[item.status]}</Badge>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
