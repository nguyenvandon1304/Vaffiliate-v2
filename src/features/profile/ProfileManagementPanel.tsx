"use client";

import { useState } from "react";
import ActionButton from "@/components/ui/ActionButton";
import type { PayoutMethod, Profile, PayoutAccountUpdateInput, ProfileUpdateInput } from "@/types/profile";
import { savePayoutAccountServiceAsync, saveProfileEditServiceAsync } from "@/services/profile-edit.service";

type Props = {
  profile: Profile;
};

const methodOptions: { value: PayoutMethod; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-wallet" },
];

export default function ProfileManagementPanel({ profile }: Props) {
  const [profileForm, setProfileForm] = useState<ProfileUpdateInput>({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
  });
  const [payoutForm, setPayoutForm] = useState<PayoutAccountUpdateInput>({
    method: profile.payoutAccount.method,
    provider: profile.payoutAccount.provider,
    accountName: profile.payoutAccount.accountName,
    accountNumber: profile.payoutAccount.accountNumber,
  });

  const [profileMessage, setProfileMessage] = useState("");
  const [payoutMessage, setPayoutMessage] = useState("");

  async function onProfileSave() {
    if (!profileForm.fullName.trim()) return setProfileMessage("Họ và tên là bắt buộc.");
    if (!profileForm.phone.trim()) return setProfileMessage("Số điện thoại là bắt buộc.");
    if (!/^\S+@\S+\.\S+$/.test(profileForm.email)) return setProfileMessage("Email không hợp lệ.");
    await saveProfileEditServiceAsync(profileForm);
    setProfileMessage("Đã lưu thông tin hồ sơ.");
  }

  async function onPayoutSave() {
    await savePayoutAccountServiceAsync(payoutForm);
    setPayoutMessage("Đã lưu tài khoản nhận tiền.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">Chỉnh sửa hồ sơ</h2>
        <div className="mt-4 grid gap-3">
          <input className="rounded-lg border p-3" value={profileForm.fullName} onChange={(e)=>setProfileForm({...profileForm,fullName:e.target.value})} />
          <input className="rounded-lg border p-3" value={profileForm.email} onChange={(e)=>setProfileForm({...profileForm,email:e.target.value})} />
          <input className="rounded-lg border p-3" value={profileForm.phone} onChange={(e)=>setProfileForm({...profileForm,phone:e.target.value})} />
          <div className="flex gap-3">
            <ActionButton type="button" onClick={onProfileSave}>Lưu</ActionButton>
            <ActionButton type="button" tone="secondary" onClick={() => setProfileForm({ fullName: profile.fullName, email: profile.email, phone: profile.phone })}>Hủy</ActionButton>
          </div>
          <p className="text-sm text-[color:var(--text-muted)]">{profileMessage}</p>
        </div>
      </section>
      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">Tài khoản nhận tiền</h2>
        <div className="mt-4 grid gap-3">
          <select className="rounded-lg border p-3" value={payoutForm.method} onChange={(e)=>setPayoutForm({...payoutForm,method:e.target.value as PayoutMethod})}>{methodOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input className="rounded-lg border p-3" value={payoutForm.provider} onChange={(e)=>setPayoutForm({...payoutForm,provider:e.target.value})} />
          <input className="rounded-lg border p-3" value={payoutForm.accountNumber} onChange={(e)=>setPayoutForm({...payoutForm,accountNumber:e.target.value})} />
          <input className="rounded-lg border p-3" value={payoutForm.accountName} onChange={(e)=>setPayoutForm({...payoutForm,accountName:e.target.value})} />
          <div className="flex gap-3">
            <ActionButton type="button" onClick={onPayoutSave}>Lưu</ActionButton>
            <ActionButton type="button" tone="secondary" onClick={() => setPayoutForm(profile.payoutAccount)}>Hủy</ActionButton>
          </div>
          <p className="text-sm text-[color:var(--text-muted)]">{payoutMessage}</p>
        </div>
      </section>
    </div>
  );
}
