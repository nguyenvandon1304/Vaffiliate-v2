import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import OrdersFilters from "@/features/orders/OrdersFilters";
import OrdersTable from "@/features/orders/OrdersTable";

export default function OrdersPage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi tiến trình đơn affiliate
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Đơn hàng
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tiền hoàn không có ngay lập tức. Đơn cần được ghi nhận, đối soát và duyệt hoa hồng trước khi có thể rút.
        </p>
      </section>

      <OrdersFilters />
      <OrdersTable />
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>
      <section className="mb-4">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi tiến trình đơn affiliate
        </p>
        <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
            Đơn hàng
          </h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Tiền hoàn không có ngay lập tức. Đơn cần được ghi nhận, đối soát và duyệt hoa hồng trước khi có thể rút.
          </p>
        </div>
      </section>

      <OrdersFilters />
      <OrdersTable />
    </ResponsiveAppShell>
  );
}
