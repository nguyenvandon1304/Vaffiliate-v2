/**
 * Phase 20I.1 -- grid that dispatches each deal to its card.
 */
import Link from "next/link";
import CashbackProgramCard from "./CashbackProgramCard";
import DealCard from "./DealCard";
import VoucherCard from "./VoucherCard";
import {
  getDealAction,
  serializeDealAction,
} from "@/services/public-deals.service";
import type { PublicDeal } from "@/services/public-deals.types";

interface DealGridProps {
  readonly deals: ReadonlyArray<PublicDeal>;
  readonly state?: "ready" | "loading" | "error" | "empty";
  readonly retryHref?: string;
}

export default function DealGrid({
  deals,
  state = "ready",
  retryHref = "/ma-giam-gia",
}: DealGridProps) {
  if (state === "loading") {
    return (
      <div
        data-testid="deal-grid-loading"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            data-testid="deal-grid-skeleton"
            className="surface-card h-44 animate-pulse bg-[rgba(124,63,44,0.06)]"
          />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        data-testid="deal-grid-error"
        className="surface-card flex flex-col gap-3 bg-[rgba(124,63,44,0.08)] p-5"
      >
        <p className="text-sm font-semibold text-[color:var(--text)]">
          Không thể tải danh sách ưu đãi. Vui lòng thử lại.
        </p>
        <Link
          href={retryHref}
          className="self-start rounded-full border border-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-strong)]"
        >
          Tải lại
        </Link>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div
        data-testid="deal-grid-empty"
        className="surface-card flex flex-col gap-2 bg-[rgba(255,250,246,0.84)] p-5"
      >
        <p className="text-sm font-semibold text-[color:var(--text)]">
          Chưa có ưu đãi nào trong danh mục này.
        </p>
        <p className="text-xs text-[color:var(--text-muted)]">
          Vui lòng quay lại sau hoặc xem các danh mục khác.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="deal-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {deals.map((deal) => {
        const action = serializeDealAction(getDealAction(deal));
        if (deal.kind === "voucher_code") {
          return (
            <VoucherCard key={deal.id} deal={deal} action={action} />
          );
        }
        if (deal.kind === "cashback_program") {
          return (
            <CashbackProgramCard key={deal.id} deal={deal} action={action} />
          );
        }
        return <DealCard key={deal.id} deal={deal} action={action} />;
      })}
    </div>
  );
}
