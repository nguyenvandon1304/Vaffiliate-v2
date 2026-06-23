"use client";

import { useActionState } from "react";

import {
  updatePayoutAccountAction,
  updateProfileAction,
} from "@/app/app/profile/actions";
import ActionButton from "@/components/ui/ActionButton";
import type { ClickPlatform } from "@/types/click";
import type { Profile } from "@/types/profile";

type Props = {
  profile: Profile;
};

const platformOptions: {
  value: ClickPlatform;
  label: string;
}[] = [
  { value: "Shopee", label: "Shopee" },
  { value: "TikTok Shop", label: "TikTok Shop" },
];

const initialProfileActionState = {
  success: false,
  message: "",
};

const initialPayoutActionState = {
  success: false,
  message: "",
};

export default function ProfileManagementPanel({
  profile,
}: Props) {
  const [
    profileState,
    profileAction,
    isProfilePending,
  ] = useActionState(
    updateProfileAction,
    initialProfileActionState,
  );

  const [
    payoutState,
    payoutAction,
    isPayoutPending,
  ] = useActionState(
    updatePayoutAccountAction,
    initialPayoutActionState,
  );

  const hasPayoutAccount = Boolean(
    profile.payoutAccount.accountNumber,
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">
          Chỉnh sửa hồ sơ
        </h2>

        <form
          id="profile-edit"
          action={profileAction}
          className="mt-4 grid gap-3"
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Họ và tên
            </span>
            <input
              name="fullName"
              defaultValue={profile.fullName}
              required
              maxLength={120}
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Email
            </span>
            <input
              value={profile.email}
              readOnly
              aria-readonly="true"
              className="cursor-not-allowed rounded-lg border border-[color:var(--line)] bg-[rgba(0,0,0,0.04)] p-3 text-[color:var(--text-muted)]"
            />
            <span className="text-xs text-[color:var(--text-muted)]">
              Email đăng nhập được quản lý riêng bởi Supabase Auth.
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Số điện thoại
            </span>
            <input
              name="phone"
              defaultValue={profile.phone}
              maxLength={30}
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Ảnh đại diện
            </span>
            <input
              name="avatarUrl"
              type="url"
              defaultValue={profile.avatarUrl ?? ""}
              maxLength={2048}
              placeholder="https://example.com/avatar.jpg"
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
          </label>

          <fieldset className="grid gap-2 rounded-lg border border-[color:var(--line)] p-3">
            <legend className="px-1 text-sm font-medium text-[color:var(--text)]">
              Sàn ưu tiên
            </legend>

            {platformOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm text-[color:var(--text)]"
              >
                <input
                  type="checkbox"
                  name="preferredPlatforms"
                  value={option.value}
                  defaultChecked={profile.preferredPlatforms.includes(
                    option.value,
                  )}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div className="flex gap-3">
            <ActionButton
              type="submit"
              disabled={isProfilePending}
            >
              {isProfilePending
                ? "Đang lưu..."
                : "Lưu hồ sơ"}
            </ActionButton>

            <ActionButton
              type="reset"
              tone="secondary"
              disabled={isProfilePending}
            >
              Hủy
            </ActionButton>
          </div>

          <p
            aria-live="polite"
            className="text-sm text-[color:var(--text-muted)]"
          >
            {profileState.message}
          </p>
        </form>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">
          Tài khoản nhận tiền
        </h2>

        <form
          id="payout-account-edit"
          action={payoutAction}
          className="mt-4 grid gap-3"
        >
          <input
            type="hidden"
            name="method"
            value="bank"
          />

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Phương thức
            </span>
            <input
              value="Tài khoản ngân hàng"
              readOnly
              aria-readonly="true"
              className="cursor-not-allowed rounded-lg border border-[color:var(--line)] bg-[rgba(0,0,0,0.04)] p-3 text-[color:var(--text-muted)]"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Ngân hàng
            </span>
            <input
              name="provider"
              defaultValue={profile.payoutAccount.provider}
              required
              maxLength={120}
              autoComplete="organization"
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Số tài khoản
            </span>
            <input
              name="accountNumber"
              defaultValue=""
              required={!hasPayoutAccount}
              inputMode="numeric"
              autoComplete="off"
              maxLength={50}
              placeholder={
                hasPayoutAccount
                  ? `Đang dùng ${profile.payoutAccount.accountNumber}; để trống để giữ nguyên`
                  : "Nhập số tài khoản"
              }
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
            {hasPayoutAccount ? (
              <span className="text-xs text-[color:var(--text-muted)]">
                Số tài khoản hiện tại được che. Chỉ nhập số mới khi cần thay đổi.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[color:var(--text)]">
              Chủ tài khoản
            </span>
            <input
              name="accountName"
              defaultValue={profile.payoutAccount.accountName}
              required
              maxLength={120}
              autoComplete="name"
              className="rounded-lg border border-[color:var(--line)] bg-white p-3"
            />
          </label>

          <div className="flex gap-3">
            <ActionButton
              type="submit"
              disabled={isPayoutPending}
            >
              {isPayoutPending
                ? "Đang lưu..."
                : "Lưu tài khoản"}
            </ActionButton>

            <ActionButton
              type="reset"
              tone="secondary"
              disabled={isPayoutPending}
            >
              Hủy
            </ActionButton>
          </div>

          <p
            aria-live="polite"
            className="text-sm text-[color:var(--text-muted)]"
          >
            {payoutState.message}
          </p>
        </form>
      </section>
    </div>
  );
}
