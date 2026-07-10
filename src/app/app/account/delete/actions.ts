"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/server-guard";
import {
  buildDeletionSuccessMessage,
  recordDeletionRequestFoundation,
  validateDeletionRequestForm,
} from "@/lib/account-deletion/account-deletion";

import type { DeletionActionState } from "./action-state";

/**
 * Phase 20I.6 -- user-facing account-deletion action.
 *
 * Flow:
 *
 *   1. Server-side `requireUser()` derives the authenticated
 *      `userId` / `email`. The form NEVER passes these.
 *   2. The action validates the user-typed confirmation phrase
 *      and the optional `reason` via `validateDeletionRequestForm`.
 *   3. On success, the request is appended to the foundation
 *      in-memory queue (no DB persistence yet) and the action
 *      returns a calm success state.
 *   4. On any failure (validation, missing session, etc.) the
 *      action returns a structured error state -- it NEVER
 *      throws, so the form can render a clear admin message
 *      instead of crashing.
 *
 * SECURITY:
 *
 *   - The action is wired through `useActionState`, so the page
 *     is a client form that POSTs to a Next.js server action
 *     bound to the authenticated session. There is no public
 *     unauthenticated path to invoke this action: `requireUser`
 *     redirects anonymous callers to /login first.
 *   - `userId` and `email` are derived server-side from
 *     `actor.userId` / `actor.email` -- never from form data.
 *     A malicious user cannot submit a deletion request for
 *     another account.
 *   - The action does NOT hard-delete auth, profile, order, or
 *     cashback data. That is the explicit Phase 20I.6 boundary.
 */

export async function requestAccountDeletionAction(
  _previousState: DeletionActionState,
  formData: FormData,
): Promise<DeletionActionState> {
  let actor;
  try {
    actor = await requireUser("/app/account/delete");
  } catch {
    // `requireUser` already redirects; we keep this branch as a
    // belt-and-braces fallback so an unexpected throw does not
    // crash the action.
    return {
      ok: false,
      message:
        "Bạn cần đăng nhập để gửi yêu cầu xóa tài khoản. Vui lòng đăng nhập và thử lại.",
    };
  }

  const validation = validateDeletionRequestForm({
    confirm: formData.get("confirm"),
    reason: formData.get("reason"),
  });
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  // The request is recorded. NO hard delete. NO mutation of
  // auth / profile / order data in this phase.
  recordDeletionRequestFoundation({
    userId: actor.userId,
    email: actor.email,
    reason: validation.reason,
  });

  // Revalidate the user page so the success state propagates if
  // the user re-opens the page after submitting.
  revalidatePath("/app/account/delete");
  revalidatePath("/app/admin/account-deletion");

  return {
    ok: true,
    status: "submitted",
    message: buildDeletionSuccessMessage(),
  };
}
