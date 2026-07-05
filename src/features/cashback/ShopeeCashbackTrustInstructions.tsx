/**
 * Trust / reliability instructions shown to the buyer alongside the
 * Shopee cashback entry flow (Phase 20H.3a; visually refreshed in
 * Phase 20H.3e).
 *
 * Six concrete rules that the buyer must follow so Vaffiliate can
 * match the eventual Shopee conversion back to their tracking link:
 *
 *   1. Start the purchase from the Vaffiliate-generated redirect and
 *      finish it in the same session.
 *   2. Do not switch to a different Shopee tab / link during the
 *      purchase session.
 *   3. Do not buy a Shopee product that was already in the cart
 *      before clicking the Vaffiliate link.
 *   4. Conversions take time to be recorded by Shopee.
 *   5. Cashback is only credited after Shopee reconciles the order.
 *   6. Phase 20H.3d: the displayed cashback estimate is computed from
 *      the Shopee commission, not the full product price.
 *
 * Visual treatment: a denser 2-column scannable list (mobile: 1-col),
 * grouped under a single "Luu y quan trong" eyebrow. The headline
 * math rule is surfaced as a static footnote so buyers reading the
 * available-quote card understand the figure. No fake cashback
 * guarantee is shown anywhere.
 */

const SHOPEE_TRUST_INSTRUCTIONS: readonly string[] = Object.freeze([
  "B\u1ea5m mua t\u1eeb Vaffiliate r\u1ed3i ho\u00e0n t\u1ea5t mua h\u00e0ng trong c\u00f9ng phi\u00ean.",
  "Kh\u00f4ng \u0111\u1ed5i sang link kh\u00e1c ngo\u00e0i phi\u00ean mua.",
  "Kh\u00f4ng d\u00f9ng s\u1ea3n ph\u1ea9m \u0111\u00e3 c\u00f3 s\u1eb5n trong gi\u1ecf n\u1ebfu c\u00f3 th\u1ec3.",
  "\u0110\u01a1n c\u1ea7n th\u1eddi gian \u0111\u1ec3 Shopee ghi nh\u1eadn.",
  "Ho\u00e0n ti\u1ec1n ph\u1ee5 thu\u1ed9c d\u1eef li\u1ec7u \u0111\u1ed1i so\u00e1t t\u1eeb Shopee.",
  "S\u1ed1 ti\u1ec1n ho\u00e0n d\u1ef1 ki\u1ebfn \u0111\u01b0\u1ee3c t\u00ednh t\u1eeb hoa h\u1ed3ng Shopee, kh\u00f4ng ph\u1ea3i t\u1eeb to\u00e0n b\u1ed9 gi\u00e1 tr\u1ecb s\u1ea3n ph\u1ea9m.",
]);

const SHOPEE_TRUST_INSTRUCTION_TITLE = "L\u01b0u \u00fd quan tr\u1ecdng";

const SHOPEE_TRUST_HEADING_TEXT =
  "6 l\u01b0u \u00fd \u0111\u1ec3 Vaffiliate ghi nh\u1eadn ho\u00e0n ti\u1ec1n Shopee";

const SHOPEE_TRUST_FOOTNOTE =
  "Ho\u00e0n ti\u1ec1n ch\u1ec9 hi\u1ec3n th\u1ecb khi ch\u01b0\u01a1ng tr\u00ecnh ho\u00e0n ti\u1ec1n \u00e1p d\u1ee5ng cho s\u1ea3n ph\u1ea9m \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn r\u00f5 r\u00e0ng. S\u1ed1 ti\u1ec1n ho\u00e0n th\u1ef1c t\u1ebf \u0111\u01b0\u1ee3c x\u00e1c \u0111\u1ecbnh theo hoa h\u1ed3ng Shopee ph\u00ea duy\u1ec7t sau khi \u0111\u01a1n h\u00e0ng ho\u00e0n t\u1ea5t.";

export default function ShopeeCashbackTrustInstructions() {
  return (
    <section
      aria-labelledby="shopee-cashback-trust-instructions-title"
      data-testid="shopee-cashback-trust-instructions"
      className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.78)] p-5 shadow-[var(--shadow-sm)]"
    >
      <p
        id="shopee-cashback-trust-instructions-title"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]"
      >
        {SHOPEE_TRUST_INSTRUCTION_TITLE}
      </p>

      <h2 className="mt-2 text-base font-semibold leading-7 text-[color:var(--text)]">
        {SHOPEE_TRUST_HEADING_TEXT}
      </h2>

      <ol
        data-testid="shopee-cashback-trust-instructions-list"
        className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {SHOPEE_TRUST_INSTRUCTIONS.map((instruction, index) => (
          <li
            key={instruction}
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.10)] bg-white/70 p-3 text-sm leading-6 text-[color:var(--text)]"
            data-testid={`shopee-cashback-trust-instructions-item-${index + 1}`}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[rgba(124,63,44,0.2)] bg-white text-[11px] font-semibold text-[color:var(--brand-strong)]"
            >
              {index + 1}
            </span>
            <span>{instruction}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-[rgba(124,63,44,0.08)] pt-3 text-xs leading-5 text-[color:var(--text-muted)]">
        {SHOPEE_TRUST_FOOTNOTE}
      </p>
    </section>
  );
}
