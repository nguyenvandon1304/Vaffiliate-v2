import type { ReactNode } from "react";

/**
 * Phase 20H.3e -- Compact three-step buyer journey shown above the
 * entry form on `/app/cashback`.
 *
 *   1. Dán link sản phẩm Shopee.
 *   2. Xem hoàn tiền dự kiến.
 *   3. Mua qua Vaffiliate và chờ Shopee ghi nhận.
 *
 * Designed to be Vietnamese-first, mobile-first, and intentionally
 * outside the buyer trust copy: the rules about cart risk, session
 * continuity, and reconciliation timing live in
 * {@link ./ShopeeCashbackTrustInstructions} so the two messages never
 * compete for the same visual emphasis.
 *
 * Pure presentational. Server-renderable. No server actions, no DB.
 */
interface ShopeeCashbackEntryStepsProps {
  /**
   * Optional id used by parent sections for in-page navigation /
   * aria-labelledby wiring. Defaults to a stable value so tests can
   * target the section by either id.
   */
  readonly id?: string;
}

interface Step {
  readonly title: string;
  readonly body: string;
}

const STEPS: ReadonlyArray<Step> = Object.freeze([
  {
    title: "D\u00e1n link s\u1ea3n ph\u1ea9m Shopee",
    body:
      "Sao ch\u00eap li\u00ean k\u1ebft s\u1ea3n ph\u1ea9m Shopee g\u1ed1c " +
      "tr\u00ean \u1ee9ng d\u1ee5ng ho\u1eb7c tr\u00ean web c\u1ee7a Shopee.",
  },
  {
    title: "Xem ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn",
    body:
      "Vaffiliate l\u1ea5y \u1ea3nh, t\u00ean, gi\u00e1 v\u00e0 m\u1ee9c ho\u00e0n ti\u1ec1n " +
      "d\u1ef1 ki\u1ebfn theo hoa h\u1ed3ng Shopee \u2014 kh\u00f4ng ph\u1ea3i " +
      "60% gi\u00e1 s\u1ea3n ph\u1ea9m.",
  },
  {
    title: "Mua qua Vaffiliate v\u00e0 ch\u1edd Shopee ghi nh\u1eadn",
    body:
      "Nh\u1ea5n mua \u0111\u1ec3 sang Shopee. Ho\u00e0n ti\u1ec1n ch\u1ec9 hi\u1ec3n th\u1ec9 " +
      "khi Shopee \u0111\u1ed1i so\u00e1t xong.",
  },
]);

const RECONCILIATION_FOOTNOTE =
  "\u0110\u01a1n Shopee th\u01b0\u1eddng c\u1ea7n th\u1eddi gian \u0111\u1ec3 \u0111\u01b0\u1ee3c \u0111\u1ed1i so\u00e1t tr\u01b0\u1edbc khi ghi nh\u1eadn ho\u00e0n ti\u1ec1n.";

export default function ShopeeCashbackEntrySteps({
  id = "shopee-cashback-entry-steps",
}: ShopeeCashbackEntryStepsProps): ReactNode {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.78)] p-5 shadow-[var(--shadow-sm)]"
      data-testid="shopee-cashback-entry-steps"
    >
      <p
        id={`${id}-title`}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]"
      >
        Cách mua qua Vaffiliate
      </p>

      <h2 className="mt-2 text-lg font-semibold leading-7 text-[color:var(--text)]">
        3 bước để nhận hoàn tiền Shopee
      </h2>

      <ol className="mt-4 space-y-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex items-start gap-3"
            data-testid={`shopee-cashback-entry-steps-${index + 1}`}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-6 text-[color:var(--text)]">
                {step.title}
              </p>
              <p className="mt-0.5 text-sm leading-6 text-[color:var(--text-muted)]">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-[rgba(124,63,44,0.08)] pt-3 text-xs leading-5 text-[color:var(--text-muted)]">
        {RECONCILIATION_FOOTNOTE}
      </p>
    </section>
  );
}
