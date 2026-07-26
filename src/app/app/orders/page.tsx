import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import BuyerOrdersList from "@/features/orders/BuyerOrdersList";
import OrdersFilters from "@/features/orders/OrdersFilters";
import {
  GenericErrorState,
  OrdersEmptyState,
} from "@/features/orders/OrdersStates";
import { loadBuyerOrdersAsync } from "@/hooks/loadBuyerOrdersAsync";
import { parseFilterParam } from "@/lib/filterUtils";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";
import type { BuyerOrderView } from "@/lib/orders/buyer-order-view";

export const metadata = privateRouteMetadata();

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type PageProps = {
  searchParams: SearchParams;
};

export default async function OrdersPage({
  searchParams,
}: PageProps) {
  const resolvedParams = await searchParams;
  const statusFilter = parseFilterParam(resolvedParams.status);

  let orders: readonly BuyerOrderView[] | null = null;
  try {
    const data = await loadBuyerOrdersAsync(statusFilter);
    orders = data.orders;
  } catch {
    orders = null;
  }

  const renderOrdersContent = () => (
    <>
      <OrdersFilters />

      {orders === null ? (
        <GenericErrorState />
      ) : orders.length === 0 ? (
        <OrdersEmptyState activeFilter={statusFilter} />
      ) : (
        <BuyerOrdersList orders={orders} />
      )}
    </>
  );

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi đơn hàng và cashback
        </p>

        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Đơn hàng
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Cashback chỉ được xác nhận sau khi đối tác đối soát giao dịch.
          Đơn bị hủy, hoàn trả hoặc không đáp ứng điều kiện có thể không
          được nhận cashback.
        </p>
      </section>

      {renderOrdersContent()}
    </div>
  );

  return (
    <BuyerResponsiveShell title="Đơn hàng" desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Theo dõi đơn hàng và cashback
            </p>
          }
          title="Đơn hàng"
          description="Cashback chỉ được xác nhận sau khi đối tác đối soát giao dịch. Đơn bị hủy, hoàn trả hoặc không đáp ứng điều kiện có thể không được nhận cashback."
        />
      </AppSection>

      <AppSection>{renderOrdersContent()}</AppSection>
    </BuyerResponsiveShell>
  );
}
