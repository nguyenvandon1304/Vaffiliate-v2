import Link from "next/link";

import type { PublicPayoutRequestSummary } from "@/lib/payout/entry-point";
import {
  formatPayoutDateTime,
  formatPayoutVnd,
  getPayoutStatusPresentation,
} from "@/lib/payout/owner-ui";

import PayoutStatusBadge from "./PayoutStatusBadge";

export default function PayoutHistoryList({
  requests,
}: {
  readonly requests: readonly PublicPayoutRequestSummary[];
}) {
  return (
    <ul className="grid list-none gap-3 p-0" aria-label="Lịch sử yêu cầu thanh toán">
      {requests.map((request) => {
        const status = getPayoutStatusPresentation(request.status);

        return (
          <li key={request.id}>
            <Link
              href={`/app/payouts/${request.id}`}
              className="group block rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-4 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
            >
              <article>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[color:var(--text-muted)]">
                      {formatPayoutDateTime(request.createdAt)}
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-[-0.02em] tabular-nums text-[color:var(--text)]">
                      {formatPayoutVnd(request.requestedAmountVnd)}
                    </p>
                  </div>
                  <PayoutStatusBadge status={request.status} />
                </div>

                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {status.description}
                </p>

                <dl className="mt-4 grid gap-2 rounded-[var(--radius-lg)] bg-[rgba(124,63,44,0.045)] p-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[color:var(--text-muted)]">Tài khoản nhận</dt>
                    <dd className="mt-1 font-medium text-[color:var(--text)]">
                      {request.destination.provider}, tài khoản ****
                      {request.destination.accountNumberMasked}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--text-muted)]">Giao dịch</dt>
                    <dd className="mt-1 font-medium tabular-nums text-[color:var(--text)]">
                      {request.itemCount} khoản đủ điều kiện
                    </dd>
                  </div>
                </dl>

                <span className="mt-4 inline-flex text-sm font-semibold text-[color:var(--brand-strong)] group-hover:underline">
                  Xem chi tiết
                </span>
              </article>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
