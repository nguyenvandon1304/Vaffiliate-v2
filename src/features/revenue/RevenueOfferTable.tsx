import { formatMoney } from "@/lib/analytics/format";
import type { RevenueOffer } from "@/types/affiliate";

export default function RevenueOfferTable({ offers }: { offers: RevenueOffer[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {offers.map((offer) => (
          <article
            key={`${offer.offerTitle}-${offer.platform}`}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{offer.offerTitle}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {offer.conversionCount} chuyển đổi
                </p>
              </div>
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                {offer.platform}
              </span>
            </div>
            <div className="mt-3 grid gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">GMV</span>
                <span className="font-medium text-[color:var(--text)]">{formatMoney(offer.gmv)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Cashback dự kiến</span>
                <span className="font-semibold text-[color:var(--success)]">{formatMoney(offer.publisherCashback)}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
