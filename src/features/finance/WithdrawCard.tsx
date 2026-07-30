import Link from "next/link";

import Card from "@/components/ui/Card";

/**
 * Phase 20M.3A -- entry point to the owner payout workflow.
 *
 * The finance overview remains read-only. This card only links to the
 * authenticated payout route, where the approved server boundary selects
 * all eligible cashback and accepts a verified destination. It makes no fee,
 * minimum, timing, or partial-payout claim.
 */
export default function WithdrawCard() {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-[color:var(--text)]">
        Yêu cầu thanh toán
      </h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        Tạo yêu cầu cho toàn bộ cashback đang đủ điều kiện và theo dõi từng
        trạng thái xử lý.
      </p>
      <Link
        href="/app/payouts"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 active:translate-y-px"
      >
        Mở yêu cầu thanh toán
      </Link>
    </Card>
  );
}
