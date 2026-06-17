import type { PayoutAccount, PayoutMethod } from "@/types/profile";

type PayoutAccountCardProps = {
  payoutAccount: PayoutAccount;
};

const methodLabels: Record<PayoutMethod, string> = {
  bank: "Tài khoản ngân hàng",
  ewallet: "Ví điện tử",
};

function PayoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] py-3 last:border-b-0">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <span className="text-sm font-medium text-[color:var(--text)]">{value}</span>
    </div>
  );
}

export default function PayoutAccountCard({ payoutAccount }: PayoutAccountCardProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">Tài khoản nhận tiền</p>
        {payoutAccount.isVerified ? (
          <span className="rounded-full bg-[rgba(34,139,87,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--success)]">
            Đã xác minh
          </span>
        ) : (
          <span className="rounded-full bg-[rgba(124,63,44,0.1)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)]">
            Chưa xác minh
          </span>
        )}
      </div>
      <div className="mt-3">
        <PayoutRow label="Phương thức" value={methodLabels[payoutAccount.method]} />
        <PayoutRow label="Ngân hàng" value={payoutAccount.provider} />
        <PayoutRow label="Số tài khoản" value={payoutAccount.accountNumber} />
        <PayoutRow label="Chủ tài khoản" value={payoutAccount.accountName} />
      </div>
    </div>
  );
}
