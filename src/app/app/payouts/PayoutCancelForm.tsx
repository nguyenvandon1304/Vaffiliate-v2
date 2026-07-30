"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cancelOwnerPayoutRequestAction } from "./actions";
import { INITIAL_PAYOUT_MUTATION_ACTION_STATE } from "./action-state";

type PayoutCancelFormProps = {
  readonly payoutRequestId: string;
  readonly idempotencyKey: string;
};

export default function PayoutCancelForm({
  payoutRequestId,
  idempotencyKey,
}: PayoutCancelFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    cancelOwnerPayoutRequestAction,
    INITIAL_PAYOUT_MUTATION_ACTION_STATE,
  );

  useEffect(() => {
    if (state.ok === true) router.refresh();
  }, [router, state]);

  const message =
    state.ok === false
      ? state.error.message
      : state.ok === true
        ? "Yêu cầu đã được hủy."
        : "";

  return (
    <details className="rounded-[var(--radius-xl)] border border-[rgba(180,70,70,0.24)] bg-[rgba(180,70,70,0.04)] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
        Hủy yêu cầu
      </summary>

      <div className="mt-3 border-t border-[rgba(180,70,70,0.18)] pt-3">
        <p className="text-sm leading-6 text-[color:var(--text-muted)]">
          Chỉ yêu cầu còn ở trạng thái Đã gửi mới có thể hủy. Khoản đã giữ sẽ
          được xử lý theo trạng thái công khai của yêu cầu.
        </p>

        <form action={formAction} className="mt-4 grid gap-3">
          <input
            type="hidden"
            name="payoutRequestId"
            value={payoutRequestId}
          />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-lg)] border border-red-700 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? "Đang hủy..." : "Xác nhận hủy"}
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
      </div>
    </details>
  );
}
