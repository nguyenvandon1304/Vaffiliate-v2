import Badge from "@/components/ui/Badge";
import { getPayoutStatusPresentation } from "@/lib/payout/owner-ui";
import type { PayoutStatus } from "@/types/payout";

export default function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const presentation = getPayoutStatusPresentation(status);

  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}
