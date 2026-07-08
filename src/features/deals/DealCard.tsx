/**
 * Phase 20I.1 -- display-only deal card (no voucher code).
 */
import type { PublicPromoDeal } from "@/services/public-deals.types";
import type { SerializedDealAction } from "@/services/public-deals.service";

interface DealCardProps {
  readonly deal: PublicPromoDeal;
  readonly action: SerializedDealAction;
}

export default function DealCard({ deal, action }: DealCardProps) {
  return (
    <article
      data-testid="deal-card"
      className="surface-card flex flex-col gap-3 bg-[rgba(255,250,246,0.86)] p-4 sm:p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">
        Deal nổi bật
      </p>
      <h3 className="text-base font-semibold leading-snug text-[color:var(--text)]">
        {deal.title}
      </h3>
      <p className="text-sm leading-6 text-[color:var(--text-muted)]">
        {deal.description}
      </p>
      {deal.discountText ? (
        <p className="text-[13px] font-medium text-[color:var(--text)]">
          Ưu đãi: {deal.discountText}
        </p>
      ) : null}
      {action.ctaHref && action.ctaIntent !== "disabled" ? (
        <a
          href={action.ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto rounded-full bg-[color:var(--text)] px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white shadow-[var(--shadow-sm)]"
        >
          {action.ctaLabel}
        </a>
      ) : (
        <p
          data-testid="deal-cta-disabled"
          aria-disabled="true"
          className="mt-auto rounded-full bg-[rgba(124,63,44,0.08)] px-4 py-2 text-center text-xs font-semibold text-[color:var(--text-muted)]"
        >
          {action.ctaLabel}
        </p>
      )}
    </article>
  );
}
