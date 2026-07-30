import { randomUUID } from "node:crypto";

import Link from "next/link";

import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import { GenericErrorState } from "@/features/orders/OrdersStates";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";

import { loadOwnerPayoutRequestAction } from "../actions";
import PayoutCancelForm from "../PayoutCancelForm";
import PayoutDetailView from "../PayoutDetailView";

export const metadata = privateRouteMetadata();
export const dynamic = "force-dynamic";

export default async function OwnerPayoutDetailPage({
  params,
}: {
  params: Promise<{ payoutRequestId: string }>;
}) {
  const { payoutRequestId } = await params;
  const result = await loadOwnerPayoutRequestAction(payoutRequestId);
  const idempotencyKey = randomUUID();

  const detailContent =
    result.ok === false ? (
      <GenericErrorState message={result.error.message} />
    ) : (
      <PayoutDetailView
        payout={result.data}
        cancelControl={
          result.data.request.status === "requested" ? (
            <PayoutCancelForm
              payoutRequestId={result.data.request.id}
              idempotencyKey={idempotencyKey}
            />
          ) : undefined
        }
      />
    );

  const shortRequestId = payoutRequestId.slice(0, 8).toUpperCase();
  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <Link
          href="/app/payouts"
          className="text-sm font-semibold text-[color:var(--brand-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
        >
          Quay lại lịch sử
        </Link>
        <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Chi tiết yêu cầu
        </h1>
        <p className="mt-2 text-sm tabular-nums text-[color:var(--text-muted)]">
          Mã yêu cầu {shortRequestId}
        </p>
      </section>
      {detailContent}
    </div>
  );

  return (
    <BuyerResponsiveShell
      title="Chi tiết thanh toán"
      brandHref="/app/payouts"
      desktopContent={desktopContent}
    >
      <AppSection>
        <PageHeader
          eyebrow={
            <Link
              href="/app/payouts"
              className="mb-2 inline-flex text-sm font-semibold text-[color:var(--brand-strong)] hover:underline"
            >
              Quay lại lịch sử
            </Link>
          }
          title="Chi tiết yêu cầu"
          description={`Mã yêu cầu ${shortRequestId}`}
        />
      </AppSection>
      <AppSection className="pb-8">{detailContent}</AppSection>
    </BuyerResponsiveShell>
  );
}
