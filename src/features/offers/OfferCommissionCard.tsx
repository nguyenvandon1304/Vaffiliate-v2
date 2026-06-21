import type { OfferDetail } from "@/types/affiliate";

type Props = {
  offer: OfferDetail["offer"];
};

export default function OfferCommissionCard({ offer }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Mức hoàn dự kiến</p>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight text-[color:var(--text)]">
          {offer.commissionRate}
        </span>
        <span className="rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
          {offer.commissionModel}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        Mức hoàn dự kiến được tính trên giá trị đơn hàng hợp lệ sau khi trừ ưu đãi trực tiếp từ sàn. Thời gian xác nhận có thể kéo dài tối đa 30 ngày kể từ khi phát sinh đơn.
      </p>
    </div>
  );
}
