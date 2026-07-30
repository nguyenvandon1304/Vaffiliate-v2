import type { ReactNode } from "react";

import type { PublicOwnedPayoutRequest } from "@/lib/payout/entry-point";
import {
  formatPayoutDateTime,
  formatPayoutVnd,
  getPayoutEventLabel,
  getPayoutOwnerReasonLabel,
  getPayoutStatusPresentation,
} from "@/lib/payout/owner-ui";

import PayoutStatusBadge from "./PayoutStatusBadge";

export default function PayoutDetailView({
  payout,
  cancelControl,
}: {
  readonly payout: PublicOwnedPayoutRequest;
  readonly cancelControl?: ReactNode;
}) {
  const { request, items, events } = payout;
  const status = getPayoutStatusPresentation(request.status);
  const ownerReason = getPayoutOwnerReasonLabel(request.ownerReasonCode);
  const amountRows = [
    { label: "Đã giữ", value: request.reservedAmountVnd },
    { label: "Đã duyệt", value: request.approvedAmountVnd },
    { label: "Đã thanh toán", value: request.paidAmountVnd },
    { label: "Đã giải phóng", value: request.releasedAmountVnd },
  ] as const;

  return (
    <div className="grid gap-4">
      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[color:var(--text-muted)]">
              Tổng yêu cầu
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] tabular-nums text-[color:var(--text)]">
              {formatPayoutVnd(request.requestedAmountVnd)}
            </p>
          </div>
          <PayoutStatusBadge status={request.status} />
        </div>

        <p className="mt-3 max-w-[65ch] text-sm leading-6 text-[color:var(--text-muted)]">
          {status.description}
        </p>

        {ownerReason ? (
          <p className="mt-3 rounded-[var(--radius-lg)] bg-[rgba(180,70,70,0.07)] p-3 text-sm leading-6 text-red-700">
            {ownerReason}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {amountRows.map((row) => (
            <div
              key={row.label}
              className="rounded-[var(--radius-lg)] bg-[rgba(124,63,44,0.045)] p-3"
            >
              <dt className="text-xs font-medium text-[color:var(--text-muted)]">
                {row.label}
              </dt>
              <dd className="mt-1 font-semibold tabular-nums text-[color:var(--text)]">
                {formatPayoutVnd(row.value)}
              </dd>
            </div>
          ))}
        </dl>

        <dl className="mt-5 grid gap-3 border-t border-[color:var(--line)] pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[color:var(--text-muted)]">Tài khoản nhận</dt>
            <dd className="mt-1 font-medium text-[color:var(--text)]">
              {request.destination.provider}, tài khoản ****
              {request.destination.accountNumberMasked}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--text-muted)]">Ngày tạo</dt>
            <dd className="mt-1 font-medium tabular-nums text-[color:var(--text)]">
              {formatPayoutDateTime(request.createdAt)}
            </dd>
          </div>
        </dl>
      </section>

      {cancelControl}

      <section
        aria-labelledby="payout-items-heading"
        className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.82)] p-5 shadow-[var(--shadow-sm)]"
      >
        <h2 id="payout-items-heading" className="text-lg font-semibold text-[color:var(--text)]">
          Các khoản trong yêu cầu
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
          {items.length} khoản cashback đủ điều kiện đã được gom vào yêu cầu này.
        </p>

        <ol className="mt-4 grid max-h-80 list-none gap-2 overflow-y-auto p-0 pr-1">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[rgba(124,63,44,0.045)] p-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[color:var(--text-muted)]">
                  Khoản {index + 1}
                </p>
                <p className="mt-1 text-xs tabular-nums text-[color:var(--text-muted)]">
                  Giữ lúc {formatPayoutDateTime(item.reservedAt)}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-[color:var(--text)]">
                {formatPayoutVnd(item.amountVnd)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="payout-timeline-heading"
        className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.82)] p-5 shadow-[var(--shadow-sm)]"
      >
        <h2 id="payout-timeline-heading" className="text-lg font-semibold text-[color:var(--text)]">
          Tiến trình công khai
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
          Các mốc dưới đây chỉ hiển thị thông tin dành cho chủ yêu cầu.
        </p>

        <ol className="mt-5 list-none space-y-4 p-0">
          {events.map((event) => {
            const eventReason = getPayoutOwnerReasonLabel(event.ownerReasonCode);
            const nextStatus = getPayoutStatusPresentation(event.nextStatus);

            return (
              <li key={event.sequenceNo} className="relative pl-7">
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-[color:var(--brand)] bg-white"
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[color:var(--text)]">
                      {getPayoutEventLabel(event.eventType)}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
                      Trạng thái: {nextStatus.label}
                    </p>
                  </div>
                  <time className="text-xs tabular-nums text-[color:var(--text-muted)]">
                    {formatPayoutDateTime(event.createdAt)}
                  </time>
                </div>
                {eventReason ? (
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {eventReason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
