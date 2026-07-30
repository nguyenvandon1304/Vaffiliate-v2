"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import type { VerifiedPayoutAccountOption } from "@/types/payout";

import { createOwnerPayoutRequestAction } from "./actions";
import { INITIAL_PAYOUT_MUTATION_ACTION_STATE } from "./action-state";

type PayoutCreateFormProps = {
  readonly accounts: readonly VerifiedPayoutAccountOption[];
  readonly idempotencyKey: string;
};

export default function PayoutCreateForm({
  accounts,
  idempotencyKey,
}: PayoutCreateFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createOwnerPayoutRequestAction,
    INITIAL_PAYOUT_MUTATION_ACTION_STATE,
  );

  useEffect(() => {
    if (state.ok === true) {
      router.push(`/app/payouts/${state.data.requestId}`);
    }
  }, [router, state]);

  const message =
    state.ok === false
      ? state.error.message
      : state.ok === true
        ? "Yêu cầu đã được tạo. Đang mở chi tiết..."
        : "";

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <fieldset disabled={isPending} className="grid gap-3">
        <legend className="text-sm font-semibold text-[color:var(--text)]">
          Chọn tài khoản nhận tiền đã xác minh
        </legend>

        {accounts.map((account, index) => (
          <label
            key={account.payoutAccountId}
            className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white/70 p-4 transition-colors hover:border-[color:var(--brand)] has-[:checked]:border-[color:var(--brand)] has-[:checked]:bg-[rgba(216,138,82,0.08)]"
          >
            <input
              type="radio"
              name="payoutAccountId"
              value={account.payoutAccountId}
              defaultChecked={index === 0}
              required
              className="mt-1 h-4 w-4 accent-[color:var(--brand)]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[color:var(--text)]">
                  {account.providerLabel}
                </span>
                <span className="text-xs font-semibold text-[color:var(--success)]">
                  Đã xác minh
                </span>
              </span>
              <span className="mt-1 block font-medium tabular-nums text-[color:var(--text-muted)]">
                {account.maskedDestination}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="rounded-[var(--radius-lg)] bg-[rgba(124,63,44,0.06)] p-4 text-sm leading-6 text-[color:var(--text-muted)]">
        Hệ thống tạo yêu cầu cho toàn bộ cashback đủ điều kiện tại thời điểm
        gửi. Bạn không nhập số tiền và không thể tách một phần.
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Đang tạo yêu cầu..." : "Tạo yêu cầu"}
      </button>

      <p
        aria-live="polite"
        className={
          state.ok === false
            ? "min-h-6 text-sm leading-6 text-red-700"
            : "min-h-6 text-sm leading-6 text-[color:var(--text-muted)]"
        }
      >
        {message}
      </p>
    </form>
  );
}
