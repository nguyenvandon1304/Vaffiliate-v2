export default function WithdrawCard() {
  return (
    <section className="mb-4">
      <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Tài chính
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Số dư khả dụng chỉ được cộng sau khi đơn được đối soát và hoa hồng được sàn duyệt.
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
        >
          Yêu cầu rút tiền
        </button>
        <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
          Rút tối thiểu 100.000đ. Yêu cầu rút tiền sẽ được xử lý sau khi thông tin tài khoản hợp lệ.
        </p>
      </div>
    </section>
  );
}
