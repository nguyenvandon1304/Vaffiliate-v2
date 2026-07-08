/**
 * Phase 20I.1 -- Shopee cashback program card.
 *
 * Routes to /cashback (the existing safe cashback flow).
 * Never exposes internal IDs.
 *
 * CTA label uses an inline white colour so the global
 * `a { color: inherit }` rule in globals.css cannot dim the
 * text against the brown button.
 */
import Link from "next/link";
import type { PublicCashbackDeal } from "@/services/public-deals.types";
import type { SerializedDealAction } from "@/services/public-deals.service";

interface CashbackProgramCardProps {
  readonly deal: PublicCashbackDeal;
  readonly action: SerializedDealAction;
}

const WHITE_TEXT_STYLE = { color: "#ffffff" } as const;

export default function CashbackProgramCard({
  deal,
  action,
}: CashbackProgramCardProps) {
  return (
    <article
      data-testid="cashback-program-card"
      className="surface-card flex flex-col gap-3 border-l-[3px] border-[color:var(--brand-strong)] bg-[rgba(255,250,246,0.92)] p-4 sm:p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">
        Chương trình hoàn tiền
      </p>
      <h3 className="text-base font-semibold leading-snug text-[color:var(--text)]">
        {deal.title}
      </h3>
      <p className="text-sm leading-6 text-[color:var(--text-muted)]">
        {deal.description}
      </p>
      <p className="text-[12px] text-[color:var(--text-muted)]">
        Thời gian áp dụng: {deal.cashbackWindowText}
      </p>
      <p
        data-testid="cashback-safe-hint"
        className="rounded-xl bg-[rgba(124,63,44,0.08)] px-3 py-2 text-[12px] leading-5 text-[color:var(--text)]"
      >
        Hoàn tiền còn phụ thuộc điều kiện của chương trình và tỷ lệ có thể thay đổi theo đợt. Vui lòng đọc điều kiện chi tiết trước khi tham gia.
      </p>
      <Link
        href={action.ctaHref ?? "/cashback"}
        data-testid="cashback-program-cta"
        style={WHITE_TEXT_STYLE}
        className="mt-auto inline-flex items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide no-underline shadow-[var(--shadow-sm)]"
      >
        {action.ctaLabel}
      </Link>
      <p className="text-[11px] leading-4 text-[color:var(--text-muted)]">
        {deal.termsNote}
      </p>
    </article>
  );
}
