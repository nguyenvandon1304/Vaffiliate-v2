/**
 * Phase 20I.6 -- account-deletion request abstraction (foundation).
 *
 * Phase 20I.6 ships the **flow** for an authenticated user to
 * submit an account-deletion request -- not a persistent storage
 * layer. This module isolates the request shape and the validation
 * rules so the action can be exercised in unit tests without
 * touching the database.
 *
 * The current project has no migration / Drizzle pipeline wired in
 * (despite Drizzle being listed as a dependency, there is no
 * `drizzle/` folder, no migration runner, and no production
 * schema in use). Wiring persistent storage is therefore deferred
 * to a later phase. This abstraction is shaped so that the
 * persistence implementation can drop in without changing the
 * page / action surface.
 *
 * Strict invariants:
 *
 *   - The user id MUST be derived from the authenticated session
 *     (`requireUser()` in the action), NEVER from a client-
 *     provided field. This module never reads a user id from a
 *     form payload.
 *   - The action MUST NOT hard-delete auth, profile, order, or
 *     cashback data. This is foundation only.
 *   - The action MUST return a structured success / error state
 *     so the form can render a clear admin message in Vietnamese.
 *   - Any future persistent implementation MUST keep this
 *     surface stable so the policy pages do not break.
 *
 * Status vocabulary is fixed here so the admin queue (Phase 20I.6
 * section C) and the user flow can share the same shape:
 *
 *   - `pending`    -- request submitted, not yet picked up by ops
 *   - `processing` -- ops is reviewing / anonymising
 *   - `completed`  -- deletion / anonymisation finished
 *   - `rejected`   -- ops could not process (e.g. fraud)
 *   - `cancelled`  -- the user cancelled their own request
 */

export type DeletionRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "rejected"
  | "cancelled";

/**
 * Canonical shape of a deletion request. The fields mirror the
 * minimum the brief recommends for a future persistent table.
 *
 * `requestedAt` is intentionally always a Date -- persistence
 * implementations are responsible for serialising / deserialising.
 */
export type AccountDeletionRequest = {
  readonly id: string;
  readonly userId: string;
  readonly email: string | null;
  readonly status: DeletionRequestStatus;
  readonly reason: string | null;
  readonly requestedAt: Date;
  readonly processedAt: Date | null;
  readonly processedBy: string | null;
  readonly adminNote: string | null;
};

/**
 * Validation constraints for the free-text `reason` field. Kept
 * small to avoid encouraging users to enter PII in the reason
 * box.
 */
export const DELETION_REASON_MAX_LENGTH = 280;

/**
 * Validation result used by the form action. The page renders the
 * `message` and renders the `ok` flag to decide whether to show
 * the success card.
 */
export type DeletionRequestValidation =
  | { readonly ok: true; readonly reason: string | null }
  | { readonly ok: false; readonly message: string };

/**
 * Constants used by the form. Exposed so the test suite can refer
 * to the same source of truth instead of duplicating literals.
 */
export const DELETION_CONFIRMATION_PHRASE = "XOA TAI KHOAN";
export const DELETION_FORM_FIELD_CONFIRM = "confirm";
export const DELETION_FORM_FIELD_REASON = "reason";

/**
 * Validate the raw confirmation + reason coming from the form.
 * Pure function. No I/O. No Supabase.
 *
 * Rules:
 *
 *   - `confirm` must be the literal "XOA TAI KHOAN" string
 *     (case-insensitive, trimmed).
 *   - `reason` may be empty (treated as no reason). If present it
 *     must be a string <= DELETION_REASON_MAX_LENGTH characters
 *     after trimming.
 *   - Any non-string / extra-long / wrong-confirm value returns
 *     a failure result with a clear Vietnamese admin message.
 */
export function validateDeletionRequestForm(input: {
  readonly confirm: unknown;
  readonly reason: unknown;
}): DeletionRequestValidation {
  const confirmRaw = input.confirm;
  const reasonRaw = input.reason;

  if (typeof confirmRaw !== "string") {
    return {
      ok: false,
      message: "Vui lòng xác nhận bằng cách nhập cụm từ bảo mật.",
    };
  }
  if (
    confirmRaw.trim().toUpperCase() !== DELETION_CONFIRMATION_PHRASE
  ) {
    return {
      ok: false,
      message:
        "Cụm từ bảo mật chưa đúng. Vui lòng nhập đúng cụm từ được yêu cầu để tiếp tục.",
    };
  }

  let reason: string | null = null;
  if (typeof reasonRaw === "string" && reasonRaw.trim().length > 0) {
    const trimmed = reasonRaw.trim();
    if (trimmed.length > DELETION_REASON_MAX_LENGTH) {
      return {
        ok: false,
        message: `Lý do xóa vượt quá ${DELETION_REASON_MAX_LENGTH} ký tự. Vui lòng rút gọn.`,
      };
    }
    reason = trimmed;
  } else if (reasonRaw !== null && reasonRaw !== undefined && reasonRaw !== "") {
    // Anything non-string AND not null/empty is invalid.
    return {
      ok: false,
      message: "Lý do xóa không hợp lệ.",
    };
  }

  return { ok: true, reason };
}

/**
 * Result of the action after the foundation flow has accepted the
 * request. The action always returns one of these -- never throws
 * -- so the form can render a calm message.
 */
export type DeletionActionState =
  | {
      readonly ok: true;
      readonly status: "submitted";
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

/**
 * Initial state passed to `useActionState`. Mirrors the
 * "unsubmitted" branch.
 */
export const INITIAL_DELETION_ACTION_STATE: DeletionActionState = {
  ok: false,
  message: "",
};

/**
 * Build the success message shown after a request has been
 * submitted. Centralised so the wording stays consistent across
 * the user page and the admin queue.
 *
 * IMPORTANT: this is foundation only. The request is appended to
 * the in-memory foundation queue; persistent storage is NOT yet
 * connected. The wording MUST NOT imply durable production
 * storage or an ops review pipeline that does not yet exist.
 * The copy says the request has been "tiếp nhận" (received
 * into the foundation flow), not "ghi nhận để xử lý" (recorded
 * for ops) or "đội ngũ vận hành sẽ xử lý" (ops will handle).
 */
export function buildDeletionSuccessMessage(): string {
  return [
    "Yêu cầu xóa tài khoản của bạn đã được tiếp nhận trong luồng nền.",
    "Hệ thống lưu trữ bền vững cho yêu cầu xóa sẽ được kết nối ở phase sau trước khi gửi app lên cửa hàng. Chưa có thao tác xóa dữ liệu thật trong phase này.",
    "Một số dữ liệu có thể cần được lưu giữ trong thời gian cần thiết để đối soát, chống gian lận hoặc đáp ứng nghĩa vụ pháp lý và kế toán nếu có. Sau thời hạn đó, dữ liệu sẽ được xóa hoặc ẩn danh hóa.",
  ].join("\n\n");
}

/**
 * In-memory foundation queue used by the admin visibility page
 * until persistent storage lands. The action appends; the admin
 * page reads.
 *
 * NOTE: this lives only inside a single Node.js process. In a
 * serverless / multi-instance deployment, two concurrent
 * deletions could land in different queues. That is acceptable
 * for the foundation phase because the user copy explicitly says
 * the request is in a foundation flow, not durable storage.
 */
const foundationQueue: AccountDeletionRequest[] = [];

function generateFoundationId(): string {
  // Avoid pulling `crypto.randomUUID()` semantics that depend on
  // a modern runtime: the id only needs to be unique within the
  // in-memory queue, so a millisecond + counter is enough.
  return `fnd-${Date.now().toString(36)}-${(foundationQueue.length + 1).toString(36)}`;
}

/**
 * Append a deletion request to the foundation queue.
 *
 * `userId` and `email` MUST come from the authenticated session
 * (the caller passes the result of `requireUser()`); the
 * function does not accept these as form fields.
 */
export function recordDeletionRequestFoundation(input: {
  readonly userId: string;
  readonly email: string | null;
  readonly reason: string | null;
}): AccountDeletionRequest {
  const entry: AccountDeletionRequest = {
    id: generateFoundationId(),
    userId: input.userId,
    email: input.email,
    status: "pending",
    reason: input.reason,
    requestedAt: new Date(),
    processedAt: null,
    processedBy: null,
    adminNote: null,
  };
  foundationQueue.push(entry);
  return entry;
}

/**
 * Read the foundation queue. The admin visibility page uses this;
 * the user page does not (it has no need to enumerate its own
 * request from the queue).
 *
 * The list is intentionally returned newest-first so the admin
 * sees the freshest requests on top.
 */
export function listDeletionRequestsFoundation(): ReadonlyArray<AccountDeletionRequest> {
  return foundationQueue.slice().reverse();
}

/**
 * Test helper ONLY: clear the in-memory queue. Production code
 * must never call this. Exported so the policy / deletion test
 * suites can assert that the queue starts empty between tests.
 */
export function __resetFoundationQueueForTests(): void {
  foundationQueue.length = 0;
}
