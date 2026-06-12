export default function MembershipCard() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[color:var(--text-muted)]">Hạng thành viên</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--text)]">
            Bạc
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Còn 10 đơn hợp lệ để lên hạng Vàng.
          </p>
        </div>
        <span className="rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
          Hạng Bạc
        </span>
      </div>
      <button type="button" className="mt-4 text-sm font-semibold text-[color:var(--brand-strong)]">
        Xem quyền lợi →
      </button>
    </div>
  );
}
