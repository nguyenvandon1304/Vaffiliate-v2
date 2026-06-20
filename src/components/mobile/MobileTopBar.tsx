import BrandLogo from "../shared/BrandLogo";

export default function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 bg-[color:var(--background)] pb-6 pt-1 md:pt-4">
      <div className="mx-auto flex max-w-[430px] items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(246,239,232,0.94)] px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur">
        <BrandLogo compact />
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-strong)]"
          aria-label="Trạng thái đồng bộ"
        >
          <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
          Đã cập nhật
        </button>
      </div>
    </header>
  );
}
