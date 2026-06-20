import Link from "next/link";
import Card from "@/components/ui/Card";

type ConsumerHomeHeroProps = {
  greeting: string;
  name: string;
  availableCashback: string;
  pendingCashback: string;
  trackedOrders: string;
};

export default function ConsumerHomeHero({
  greeting,
  name,
  availableCashback,
  pendingCashback,
  trackedOrders,
}: ConsumerHomeHeroProps) {
  return (
    <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
      <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
        {greeting}, {name}
      </p>

      <div className="mb-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
            Nhận cashback khi mua sắm online
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]">
            Dán link sản phẩm hoặc chọn chương trình phù hợp. Hệ thống sẽ giúp bạn tạo đúng link để ghi nhận giao dịch.
          </p>
        </div>
        <Link
          href="/app/cashback"
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
        >
          Tạo link hoàn tiền
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-[color:var(--text-muted)]">
            Cashback dự kiến
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">
            {pendingCashback}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[color:var(--text-muted)]">
            Có thể rút
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--success)]">
            {availableCashback}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[color:var(--text-muted)]">
            Đơn ghi nhận
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">
            {trackedOrders}
          </p>
        </Card>
      </div>
    </section>
  );
}
