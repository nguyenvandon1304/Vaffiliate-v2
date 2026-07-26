import Card from "@/components/ui/Card";

/**
 * Phase 20M-R -- truthful, non-interactive payout surface.
 *
 * No payout-request model exists in the schema, so there is nothing this
 * surface could legitimately submit to. It therefore renders as plain text
 * rather than a disabled button: a greyed-out button implies the action
 * exists and is merely unavailable right now, which overstates what the
 * product can actually do.
 *
 * The previous copy promised a minimum-withdrawal threshold. No such
 * constant exists anywhere in the schema or the codebase, so it has been
 * removed rather than restated. Nothing here claims a fee, a minimum, an
 * eligibility rule or a processing time, because none of those are defined
 * in the domain yet.
 *
 * This is a Server Component: with no interactive element left, there is no
 * reason to ship it to the client.
 */
export default function WithdrawCard() {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-[color:var(--text)]">
        Yêu cầu thanh toán
      </h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        Tính năng yêu cầu thanh toán chưa khả dụng. Cashback ở trạng thái có
        thể rút sẽ được giữ nguyên cho đến khi tính năng này được mở.
      </p>
    </Card>
  );
}
