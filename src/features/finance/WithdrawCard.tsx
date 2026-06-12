export default function WithdrawCard() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.82)] p-5 shadow-[var(--shadow-sm)]">
      <button
        type="button"
        className="w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
      >
        Yêu cầu rút tiền
      </button>
      <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
        Rút tối thiểu 100.000đ. Yêu cầu rút tiền sẽ được xử lý sau khi thông tin tài khoản hợp lệ.
      </p>
    </div>
  );
}
