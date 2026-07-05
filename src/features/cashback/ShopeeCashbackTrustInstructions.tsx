/**
 * Trust / reliability instructions shown to the buyer alongside the
 * Shopee cashback entry flow (Phase 20H.3a).
 *
 * Five concrete rules that the buyer must follow so Vaffiliate can
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
 *
 * Visual treatment: a soft, scannable ordered list. Numerals are
 * hand-drawn glyphs sized for low-attention scan; copy stays natural
 * Vietnamese. No fake cashback guarantee is shown anywhere.
 */

const SHOPEE_TRUST_INSTRUCTIONS: readonly string[] = Object.freeze([
  "Bấm mua từ Vaffiliate rồi hoàn tất mua hàng trong cùng phiên.",
  "Không đổi sang link khác ngoài phiên mua.",
  "Không dùng sản phẩm đã có sẵn trong giỏ nếu có thể.",
  "Đơn cần thời gian để ghi nhận.",
  "Hoàn tiền phụ thuộc dữ liệu đối soát từ Shopee.",
]);

const SHOPEE_TRUST_INSTRUCTION_TITLE =
  "Lưu ý để Vaffiliate ghi nhận hoàn tiền";

export default function ShopeeCashbackTrustInstructions() {
  return (
    <section
      aria-labelledby="shopee-cashback-trust-instructions-title"
      className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.78)] p-5 shadow-[var(--shadow-sm)]"
    >
      <p
        id="shopee-cashback-trust-instructions-title"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]"
      >
        {SHOPEE_TRUST_INSTRUCTION_TITLE}
      </p>

      <ol className="mt-3 space-y-2.5">
        {SHOPEE_TRUST_INSTRUCTIONS.map((instruction, index) => (
          <li
            key={instruction}
            className="flex items-start gap-3 text-sm leading-6 text-[color:var(--text)]"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[rgba(124,63,44,0.2)] bg-white/80 text-[11px] font-semibold text-[color:var(--brand-strong)]"
            >
              {index + 1}
            </span>
            <span>{instruction}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs leading-5 text-[color:var(--text-muted)]">
        Hoàn tiền chỉ hiển thị khi chương trình hoàn tiền áp dụng cho sản
        phẩm được xác nhận rõ ràng. Số tiền hoàn thực tế được xác định
        theo hoa hồng Shopee phê duyệt sau khi đơn hàng hoàn tất.
      </p>
    </section>
  );
}