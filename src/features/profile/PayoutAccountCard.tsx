import type {
  PayoutAccount,
  PayoutAccountStatus,
} from "@/types/profile";

type PayoutAccountCardProps = {
  payoutAccount: PayoutAccount;
};

const statusLabels: Record<
  PayoutAccountStatus,
  string
> = {
  unverified: "Chưa xác minh",
  verified: "Đã xác minh",
  rejected: "Bị từ chối",
  disabled: "Đã vô hiệu hóa",
};

const statusClasses: Record<
  PayoutAccountStatus,
  string
> = {
  unverified:
    "bg-[rgba(124,63,44,0.1)] text-[color:var(--text-muted)]",
  verified:
    "bg-[rgba(34,139,87,0.14)] text-[color:var(--success)]",
  rejected:
    "bg-red-50 text-red-700",
  disabled:
    "bg-[rgba(0,0,0,0.06)] text-[color:var(--text-muted)]",
};

function PayoutRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] py-3 last:border-b-0">
      <span className="text-sm text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className="text-sm font-medium text-[color:var(--text)]">
        {value}
      </span>
    </div>
  );
}

export default function PayoutAccountCard({
  payoutAccount,
}: PayoutAccountCardProps) {
  const hasPayoutAccount = Boolean(
    payoutAccount.accountNumber,
  );

  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">
          Tài khoản nhận tiền
        </p>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            hasPayoutAccount
              ? statusClasses[payoutAccount.status]
              : "bg-[rgba(0,0,0,0.06)] text-[color:var(--text-muted)]"
          }`}
        >
          {hasPayoutAccount
            ? statusLabels[payoutAccount.status]
            : "Chưa thiết lập"}
        </span>
      </div>

      {hasPayoutAccount ? (
        <div className="mt-3">
          <PayoutRow
            label="Phương thức"
            value="Tài khoản ngân hàng"
          />
          <PayoutRow
            label="Ngân hàng"
            value={payoutAccount.provider}
          />
          <PayoutRow
            label="Số tài khoản"
            value={payoutAccount.accountNumber}
          />
          <PayoutRow
            label="Chủ tài khoản"
            value={payoutAccount.accountName}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[color:var(--text-muted)]">
          Bạn chưa thiết lập tài khoản nhận tiền.
          Hãy nhập thông tin ngân hàng trong biểu mẫu chỉnh sửa.
        </p>
      )}
    </div>
  );
}
