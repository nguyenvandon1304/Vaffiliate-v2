/**
 * Phase 20I.1 -- hero block for the public deals page.
 */
export default function DealHero() {
  return (
    <section
      data-testid="deal-hero"
      className="surface-card flex flex-col gap-4 bg-[rgba(255,250,246,0.84)] p-5 sm:p-7"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
        Mã giảm giá & ưu đãi
      </p>
      <h1 className="max-w-[20ch] text-[length:var(--text-2xl)] font-semibold leading-[1.05] tracking-[-0.02em] text-[color:var(--text)] sm:text-[length:var(--text-5xl)]">
        Tìm mã, deal và ưu đãi Shopee đang được cập nhật.
      </h1>
      <p className="max-w-[60ch] text-sm leading-6 text-[color:var(--text-muted)] sm:text-base">
        Tổng hợp mã giảm giá, deal nổi bật và các chương trình hoàn tiền đang áp dụng trên các sàn phổ biến. Luôn kiểm tra điều kiện trước khi áp dụng mã.
      </p>
    </section>
  );
}
