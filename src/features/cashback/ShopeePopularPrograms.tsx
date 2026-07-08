/**
 * Phase 20H.7a -- "Chương trình phổ biến" data-driven section.
 *
 * Renders the merged list of program cards:
 *
 *   - LIVE cards backed by a real catalog offer (active).
 *   - Mock future traffic-source campaign cards (coming soon).
 *
 * Design choices (per design-taste-frontend, calm/editorial dial
 * set: VARIANCE 6, MOTION 3, DENSITY 3):
 *
 *   - No new gradients or glass surfaces; reuses the existing
 *     surface-card token to match the rest of the cashback page.
 *   - Cards render with the existing Vietnamese trust copy and
 *     never promise guaranteed cashback or voucher.
 *   - Active cards display the badge "Hoàn tiền dự kiến" so the
 *     buyer understands the cashback is conditional.
 *   - Coming-soon cards are visually de-emphasised (opacity-70
 *     and aria-disabled) so they read as "not yet".
 *   - Internal IDs (campaignId, offerId, etc.) are NEVER rendered
 *     into the DOM. They are passed in only so a future phase can
 *     wire a CTA; for now every card is informational only.
 *
 * The component is a pure presentational server component: it
 * receives `cards` as a prop so tests can render it in isolation
 * without hitting the live catalog.
 */
import type { ShopeeProgramCard } from "@/services/shopee-programs.types";

function isActiveCard(
  card: ShopeeProgramCard,
): card is Extract<ShopeeProgramCard, { kind: "active" }> {
  return card.kind === "active";
}

function isComingSoonCard(
  card: ShopeeProgramCard,
): card is Extract<ShopeeProgramCard, { kind: "coming_soon" }> {
  return card.kind === "coming_soon";
}

interface CardSurfaceProps {
  readonly card: ShopeeProgramCard;
}

function CardSurface({ card }: CardSurfaceProps) {
  const isActive = isActiveCard(card);
  const testId = isActive
    ? "program-card-active"
    : "program-card-coming-soon";

  return (
    <article
      data-testid={testId}
      aria-disabled={isActive ? undefined : "true"}
      className={[
        "surface-card flex h-full flex-col gap-3 p-5",
        isActive
          ? "bg-[rgba(255,252,249,0.92)]"
          : "bg-[rgba(255,250,246,0.62)] opacity-70",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={[
            "inline-flex rounded-full px-3 py-1 text-xs font-medium",
            isActive
              ? "border border-[rgba(124,63,44,0.16)] bg-[rgba(255,250,246,0.86)] text-[color:var(--brand-strong)]"
              : "border border-dashed border-[rgba(124,63,44,0.18)] bg-transparent text-[color:var(--text-muted)]",
          ].join(" ")}
        >
          {card.badge}
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {card.category}
        </span>
      </div>

      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--text)]">
        {card.title}
      </h3>

      <p className="text-sm leading-6 text-[color:var(--text-muted)]">
        {card.subtitle}
      </p>

      {!isActive && isComingSoonCard(card) ? (
        <p className="mt-auto text-xs leading-5 text-[color:var(--text-muted)]">
          {card.safeNote}
        </p>
      ) : null}
    </article>
  );
}

interface ShopeePopularProgramsProps {
  readonly cards: ReadonlyArray<ShopeeProgramCard>;
}

export default function ShopeePopularPrograms({
  cards,
}: ShopeePopularProgramsProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="shopee-popular-programs-heading"
      className="mt-8"
    >
      <header className="mb-4 flex flex-col gap-1">
        <h2
          id="shopee-popular-programs-heading"
          className="text-base font-semibold tracking-[-0.01em] text-[color:var(--text)]"
        >
          Chương trình phổ biến
        </h2>
        <p className="text-sm leading-6 text-[color:var(--text-muted)]">
          Hoàn tiền áp dụng khi Shopee ghi nhận hoa hồng cho đơn hàng.
        </p>
      </header>

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="shopee-popular-programs-grid"
      >
        {cards.map((card) => (
          <CardSurface key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
