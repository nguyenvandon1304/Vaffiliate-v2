import type { Conversion, Offer } from "@/types/affiliate";

type Props = {
  conversions: Conversion[];
  offer: Offer;
};

const statusLabels: Record<Conversion["status"], string> = {
  pending: "Đang chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
  paid: "Đã thanh toán",
};

const statusVariant: Record<
  Conversion["status"],
  "default" | "success" | "warning" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  paid: "success",
};

export default function TrackingLinkPerformanceCard({ conversions, offer }: Props) {
  const commissionValue = (orderValue: string) => {
    const numeric = Number(orderValue.replace(/[^\d]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return "0đ";
    const rate = Number(offer.commissionRate.replace(/[^\d]/g, "")) || 0;
    const earned = Math.round((numeric * rate) / 100);
    return earned.toLocaleString("vi-VN") + "đ";
  };

  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Conversion gần đây</p>
      {conversions.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          Chưa có chuyển đổi nào từ tracking link này.
        </p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {conversions.map((conv) => (
            <li
              key={conv.id}
              className="flex items-center justify-between gap-3 border-b border-[rgba(124,63,44,0.08)] pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="font-mono text-[color:var(--text-muted)]">{conv.id}</p>
                <p className="text-xs text-[color:var(--text-muted)]">{conv.occurredAt}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-[color:var(--text)]">{conv.orderValue}</p>
                <p className="text-xs font-medium text-[color:var(--success)]">
                  ~{commissionValue(conv.orderValue)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusVariant[conv.status] === "success"
                    ? "bg-[rgba(47,143,97,0.14)] text-[color:var(--success)]"
                    : statusVariant[conv.status] === "warning"
                      ? "bg-[rgba(220,157,67,0.14)] text-[color:var(--warning)]"
                      : "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)]"
                }`}
              >
                {statusLabels[conv.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
