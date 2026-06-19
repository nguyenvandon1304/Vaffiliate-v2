"use client";

import Card from "@/components/ui/Card";

export default function WithdrawCard() {
  return (
    <Card className="p-5">
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-[var(--radius-lg)] bg-[rgba(216,138,82,0.14)] px-4 py-3 text-sm font-semibold text-[color:var(--text-muted)]"
        aria-disabled="true"
        title="Tính năng rút tiền sẽ sớm được triển khai"
      >
        Yêu cầu rút tiền
      </button>
      <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
        Rút tối thiểu 100.000đ. Tính năng rút tiền sẽ được triển khai sớm. Cashback sẽ được chuyển sang có thể rút sau khi đối tác xác nhận giao dịch.
      </p>
    </Card>
  );
}
