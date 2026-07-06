"use client";

/**
 * Phase 20H.4a -- production wrapper for the public cashback flow.
 *
 * Imports `<ShopeeCashbackPreviewForm/>` so the form's server-action
 * chain is resolved at module evaluation. Lives in its own file so
 * `PublicCashbackFlow` itself stays free of the server-action import
 * and can be unit-tested with a stub preview slot.
 *
 * Server page usage:
 *
 *   import PublicCashbackFlowWithPreview from "@/features/cashback/PublicCashbackFlowWithPreview";
 *   ...
 *   <PublicCashbackFlowWithPreview
 *     isAuthenticated={...}
 *     initialProductUrl={...}
 *   />
 */

import ShopeeCashbackPreviewForm from "@/features/cashback/ShopeeCashbackPreviewForm";

import PublicCashbackFlow, {
  type PublicCashbackFlowProps,
} from "@/features/cashback/PublicCashbackFlow";

export default function PublicCashbackFlowWithPreview(
  props: Omit<PublicCashbackFlowProps, "previewSlot">,
) {
  return <PublicCashbackFlow {...props} previewSlot={ShopeeCashbackPreviewForm} />;
}
