"use client";

import { useActionState, useState } from "react";

import { updateProfileAction } from "@/app/app/profile/actions";
import ActionButton from "@/components/ui/ActionButton";
import { savePayoutAccountServiceAsync } from "@/services/profile-edit.service";
import type { ClickPlatform } from "@/types/click";
import type {
  PayoutAccountUpdateInput,
  PayoutMethod,
  Profile,
} from "@/types/profile";

type Props = {
  profile: Profile;
};

const methodOptions: { value: PayoutMethod; label: string }[] = [
  { value: "bank", label: "Ngân hàng" },
  { value: "ewallet", label: "Ví điện tử" },
];

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

  const [payoutForm, setPayoutForm] =
    useState<PayoutAccountUpdateInput>({
      method: profile.payoutAccount.method,
      provider: profile.payoutAccount.provider,
      accountName: profile.payoutAccount.accountName,
      accountNumber: profile.payoutAccount.accountNumber,
    });

  const [payoutMessage, setPayoutMessage] = useState("");

  async function onPayoutSave() {
    await savePayoutAccountServiceAsync(payoutForm);
    setPayoutMessage(
      "Đã lưu tài khoản nhận tiền trong dữ liệu mô phỏng.",
    );
  }

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

        <div className="mt-4 grid gap-3">
          <select
            className="rounded-lg border p-3"
            value={payoutForm.method}
            onChange={(event) =>
              setPayoutForm({
                ...payoutForm,
                method: event.target.value as PayoutMethod,
              })
            }
          >
            {methodOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>

          <input
            className="rounded-lg border p-3"
            value={payoutForm.provider}
            onChange={(event) =>
              setPayoutForm({
                ...payoutForm,
                provider: event.target.value,
              })
            }
          />

          <input
            className="rounded-lg border p-3"
            value={payoutForm.accountNumber}
            onChange={(event) =>
              setPayoutForm({
                ...payoutForm,
                accountNumber: event.target.value,
              })
            }
          />

          <input
            className="rounded-lg border p-3"
            value={payoutForm.accountName}
            onChange={(event) =>
              setPayoutForm({
                ...payoutForm,
                accountName: event.target.value,
              })
            }
          />

          <div className="flex gap-3">
            <ActionButton
              type="button"
              onClick={onPayoutSave}
            >
              Lưu
            </ActionButton>

            <ActionButton
              type="button"
              tone="secondary"
              onClick={() =>
                setPayoutForm({
                  method: profile.payoutAccount.method,
                  provider: profile.payoutAccount.provider,
                  accountName:
                    profile.payoutAccount.accountName,
                  accountNumber:
                    profile.payoutAccount.accountNumber,
                })
              }
            >
              Hủy
            </ActionButton>
          </div>

          <p className="text-sm text-[color:var(--text-muted)]">
            {payoutMessage}
          </p>
        </div>
      </section>
    </div>
  );
}