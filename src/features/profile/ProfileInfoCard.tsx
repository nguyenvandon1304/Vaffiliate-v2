import type { Profile } from "@/types/profile";

type ProfileInfoCardProps = {
  profile: Profile;
};

function formatJoinedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] py-3 last:border-b-0">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <span className="text-sm font-medium text-[color:var(--text)]">{value}</span>
    </div>
  );
}

export default function ProfileInfoCard({ profile }: ProfileInfoCardProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Thông tin cá nhân</p>
      <div className="mt-3">
        <InfoRow label="Họ và tên" value={profile.fullName} />
        <InfoRow label="Email" value={profile.email} />
        <InfoRow label="Số điện thoại" value={profile.phone} />
        <InfoRow label="Ngày tham gia" value={formatJoinedDate(profile.joinedAt)} />
      </div>
    </div>
  );
}
