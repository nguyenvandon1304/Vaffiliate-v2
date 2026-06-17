import type { Profile } from "@/types/profile";

type ProfileHeaderProps = {
  profile: Profile;
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

export default function ProfileHeader({ profile }: ProfileHeaderProps) {
  return (
    <div className="surface-card flex items-center gap-4 bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
      <div
        aria-hidden
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--accent))] text-xl font-semibold text-white shadow-[var(--shadow-sm)]"
      >
        {getInitials(profile.fullName)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-[-0.03em] text-[color:var(--text)]">
          {profile.fullName}
        </p>
        <p className="mt-1 truncate text-sm text-[color:var(--text-muted)]">
          {profile.email}
        </p>
        <span className="mt-2 inline-flex rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
          {profile.memberTier}
        </span>
      </div>
    </div>
  );
}
