import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import OrdersFilters from "@/features/orders/OrdersFilters";
import OrdersTable from "@/features/orders/OrdersTable";
import { loadOrdersAsync } from "@/hooks/loadOrdersAsync";

export default async function OrdersPage() {
  const { filters, orders } = await loadOrdersAsync();

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

      <OrdersFilters filters={filters} />
      <OrdersTable orders={orders} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Theo dõi tiến trình đơn affiliate
            </p>
          }
          title="Đơn hàng"
          description="Tiền hoàn không có ngay lập tức. Đơn cần được ghi nhận, đối soát và duyệt hoa hồng trước khi có thể rút."
        />
      </AppSection>
      <AppSection>
        <OrdersFilters filters={filters} />
      </AppSection>
      <OrdersTable orders={orders} />
    </AppShell>
  );
}
