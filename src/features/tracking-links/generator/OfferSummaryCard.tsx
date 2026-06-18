import type { Offer } from "@/types/affiliate";

type Props = {
  offer: Offer;
  categoryLabel: string | null;
};

export default function OfferSummaryCard({ offer, categoryLabel }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Offer</p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-[color:var(--text)]">
        {offer.title}
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Danh mục</dt>
          <dd className="font-medium text-[color:var(--text)]">{categoryLabel ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Hoa hồng</dt>
          <dd className="font-medium text-[color:var(--text)]">
            {offer.commissionRate} · {offer.commissionModel}
          </dd>
        </div>
      </dl>
    </div>
  );
}
