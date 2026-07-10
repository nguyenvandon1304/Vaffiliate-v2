"use client";

import { useActionState } from "react";

import { requestAccountDeletionAction } from "@/app/app/account/delete/actions";
import {
  INITIAL_DELETION_ACTION_STATE,
  type DeletionActionState,
} from "@/app/app/account/delete/action-state";

/**
 * Phase 20I.6 -- client form for the account-deletion request.
 *
 * The form is intentionally a pure UI / state renderer. It does
 * not touch the session, does not decide whether the user is
 * allowed to submit (the action's `requireUser()` decides that
 * server-side), and does not hard-delete anything locally.
 *
 * Defensive rendering:
 *
 *   - The action state is a discriminated union `{ ok: true } |
 *     { ok: false }`. `useActionState` may briefly observe a
 *     partial object during hydration, so reads go through
 *     local helpers that default to "" / false so the form
 *     never crashes on first paint.
 *   - The confirmation input is a required `text` field so the
 *     browser blocks empty submits. The server action ALSO
 *     validates it -- defence in depth.
 */
export default function AccountDeletionForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<
    DeletionActionState,
    FormData
  >(requestAccountDeletionAction, INITIAL_DELETION_ACTION_STATE);

  const message = typeof state?.message === "string" ? state.message : "";
  const submitted = state?.ok === true;
  const showError = !submitted && message.length > 0;

  return (
    <form action={formAction} className="va-account-deletion-form">
      <p className="va-account-deletion-form__intro">
        Vui lòng đọc kỹ trước khi gửi yêu cầu. Phase này chỉ
        cung cấp luồng nền để kiểm tra quy trình. Hệ thống lưu
        trữ bền vững cho yêu cầu xóa sẽ được kết nối ở phase sau
        trước khi gửi app lên cửa hàng. Một số dữ liệu có thể cần
        được lưu giữ trong thời gian cần thiết để đối soát, chống
        gian lận hoặc đáp ứng nghĩa vụ pháp lý và kế toán nếu có.
      </p>

      <label className="va-account-deletion-form__field">
        <span>
          Lý do xóa <small>(không bắt buộc)</small>
        </span>
        <textarea
          name="reason"
          rows={4}
          maxLength={280}
          placeholder="Lý do bạn muốn xóa tài khoản (không bắt buộc, giúp cải thiện dịch vụ)."
        />
      </label>

      <label className="va-account-deletion-form__field">
        <span>
          Nhập <code>XOA TAI KHOAN</code> để xác nhận
        </span>
        <input
          type="text"
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          pattern="XOA TAI KHOAN"
          required
          placeholder="XOA TAI KHOAN"
        />
      </label>

      <button
        type="submit"
        className="va-account-deletion-form__submit"
        disabled={isPending || submitted}
      >
        {submitted ? "Đã gửi yêu cầu" : isPending ? "Đang gửi..." : "Gửi yêu cầu xóa"}
      </button>

      {submitted ? (
        <p
          role="status"
          aria-live="polite"
          className="va-account-deletion-form__success"
        >
          {message}
        </p>
      ) : null}

      {showError ? (
        <p
          role="status"
          aria-live="polite"
          className="va-account-deletion-form__error"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
