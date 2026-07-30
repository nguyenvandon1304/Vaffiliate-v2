import { randomUUID } from "node:crypto";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { GenericErrorState } from "@/features/orders/OrdersStates";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";
import { listVerifiedOwnerPayoutAccountsAsync } from "@/services/payout-account.service";
import type { VerifiedPayoutAccountOption } from "@/types/payout";

import { listOwnerPayoutRequestsAction } from "./actions";
import PayoutCreateForm from "./PayoutCreateForm";
import PayoutHistoryList from "./PayoutHistoryList";

export const metadata = privateRouteMetadata();
export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION =
  "Chọn một tài khoản nhận tiền đã xác minh để tạo yêu cầu cho toàn bộ cashback đang đủ điều kiện.";

async function loadVerifiedPayoutAccounts(): Promise<
  readonly VerifiedPayoutAccountOption[] | null
> {
  try {
    return await listVerifiedOwnerPayoutAccountsAsync();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

export default async function OwnerPayoutsPage() {
  const [requestsResult, accounts] = await Promise.all([
    listOwnerPayoutRequestsAction(),
    loadVerifiedPayoutAccounts(),
  ]);
  const idempotencyKey = randomUUID();

  const createSection = (
    <section
      aria-labelledby="create-payout-heading"
      className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]"
    >
      <h2 id="create-payout-heading" className="text-lg font-semibold text-[color:var(--text)]">
        Tạo yêu cầu thanh toán
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm leading-6 text-[color:var(--text-muted)]">
        Chỉ tài khoản đã xác minh mới xuất hiện trong danh sách. Số tiền được
        xác định từ các khoản cashback đủ điều kiện trên máy chủ.
      </p>

      <div className="mt-5">
        {accounts === null ? (
          <GenericErrorState message="Không thể tải tài khoản nhận tiền đã xác minh. Vui lòng thử lại." />
        ) : accounts.length === 0 ? (
          <div className="grid gap-4">
            <EmptyState
              title="Chưa có tài khoản nhận tiền đã xác minh"
              description="Hãy kiểm tra thông tin tài khoản nhận tiền trong hồ sơ. Chỉ tài khoản đã được xác minh mới có thể dùng để tạo yêu cầu."
            />
            <Link
              href="/app/profile#payout-account-edit"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--brand-strong)] transition-colors hover:bg-[rgba(216,138,82,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
            >
              Mở hồ sơ nhận tiền
            </Link>
          </div>
        ) : (
          <PayoutCreateForm
            accounts={accounts}
            idempotencyKey={idempotencyKey}
          />
        )}
      </div>
    </section>
  );

  const historySection = (
    <section aria-labelledby="payout-history-heading">
      <div className="mb-3">
        <h2 id="payout-history-heading" className="text-lg font-semibold text-[color:var(--text)]">
          Lịch sử thanh toán
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
          Theo dõi trạng thái và mở từng yêu cầu để xem tiến trình công khai.
        </p>
      </div>

      {requestsResult.ok === false ? (
        <GenericErrorState message={requestsResult.error.message} />
      ) : requestsResult.data.length === 0 ? (
        <EmptyState
          title="Chưa có yêu cầu thanh toán"
          description="Yêu cầu đầu tiên sẽ xuất hiện tại đây sau khi bạn chọn tài khoản đã xác minh và gửi biểu mẫu."
        />
      ) : (
        <PayoutHistoryList requests={requestsResult.data} />
      )}
    </section>
  );

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Yêu cầu thanh toán
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
          {PAGE_DESCRIPTION}
        </p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {createSection}
        {historySection}
      </div>
    </div>
  );

  return (
    <BuyerResponsiveShell title="Thanh toán" desktopContent={desktopContent}>
      <AppSection>
        <PageHeader eyebrow={null} title="Yêu cầu thanh toán" description={PAGE_DESCRIPTION} />
      </AppSection>
      <AppSection className="mb-5">{createSection}</AppSection>
      <AppSection className="pb-8">{historySection}</AppSection>
    </BuyerResponsiveShell>
  );
}
