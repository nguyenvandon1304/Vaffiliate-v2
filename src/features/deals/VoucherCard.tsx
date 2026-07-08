/**
 * Phase 20I.1 -- voucher card with Copy-to-clipboard button.
 */
"use client";
import { useState } from "react";
import type { PublicVoucherDeal } from "@/services/public-deals.types";
import type { SerializedDealAction } from "@/services/public-deals.service";

interface VoucherCardProps {
  readonly deal: PublicVoucherDeal;
  readonly action: SerializedDealAction;
}

export default function VoucherCard({ deal, action }: VoucherCardProps) {
  const [copied, setCopied] = useState(false);
  const isExpired = deal.status === "expired";

  function handleCopy(): void {
    if (!action.code) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(action.code)
        .then(() => setCopied(true))
        .catch(() => undefined);
      return;
    }
    setCopied(true);
  }

  return (
    <article
      data-testid="voucher-card"
      data-disabled={isExpired ? "true" : undefined}
      className={`surface-card flex flex-col gap-3 bg-[rgba(255,250,246,0.86)] p-4 sm:p-5${isExpired ? " opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">
          Voucher Shopee
        </p>
        {deal.isExclusive ? (
          <span className="rounded-full bg-[color:var(--brand-strong)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            Độc quyền
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold leading-snug text-[color:var(--text)]">
        {deal.title}
      </h3>
      <p className="text-sm leading-6 text-[color:var(--text-muted)]">
        {deal.description}
      </p>
      {deal.discountText ? (
        <p className="text-[13px] font-medium text-[color:var(--text)]">
          Ưu đãi: {deal.discountText}
        </p>
      ) : null}
      {deal.minSpendText ? (
        <p className="text-[12px] text-[color:var(--text-muted)]">
          {deal.minSpendText}
        </p>
      ) : null}
      {deal.code && !isExpired ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--brand-strong)] bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <code
            data-testid="voucher-code"
            className="text-base font-semibold tracking-[0.08em] text-[color:var(--text)]"
          >
            {deal.code}
          </code>
          <button
            type="button"
            data-testid="voucher-copy-button"
            aria-disabled={copied ? "true" : undefined}
            disabled={copied ? true : undefined}
            onClick={handleCopy}
            className={`rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[var(--shadow-sm)]${copied ? " opacity-60" : ""}`}
          >
            {copied ? "Đã sao chép" : "Sao chép mã"}
          </button>
        </div>
      ) : null}
      {isExpired ? (
        <p
          data-testid="voucher-expired"
          className="rounded-full bg-[rgba(124,63,44,0.08)] px-3 py-1 text-center text-xs font-semibold text-[color:var(--text-muted)]"
        >
          Đã hết hạn
        </p>
      ) : null}
    </article>
  );
}
