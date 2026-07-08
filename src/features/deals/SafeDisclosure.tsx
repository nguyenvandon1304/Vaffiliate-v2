/**
 * Phase 20I.1 -- buyer-facing disclosure (no guaranteed claims).
 */
export default function SafeDisclosure() {
  return (
    <aside
      data-testid="safe-disclosure"
      aria-label="Lưu ý về mã và hoàn tiền"
      className="surface-card mt-6 flex flex-col gap-2 border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.7)] p-4 text-sm leading-6 text-[color:var(--text-muted)] sm:text-[13px]"
    >
      <p className="font-semibold text-[color:var(--text)]">
        Voucher và hoàn tiền - lưu ý
      </p>
      <p>
        Các mã giảm giá và deal được tổng hợp từ các sàn nổi tiếng và có thể thay đổi theo thời điểm. Việc áp dụng mã có thể phụ thuộc vào điều kiện của chương trình, sản phẩm và thời gian áp dụng.
      </p>
      <p>
        Tỷ lệ hoàn tiền (nếu có) còn tùy thuộc đợt áp dụng và điều kiện của chương trình. Vui lòng kiểm tra chi tiết trước khi tham gia.
      </p>
    </aside>
  );
}
