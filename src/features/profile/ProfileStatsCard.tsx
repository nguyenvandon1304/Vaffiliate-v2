type ProfileStatsCardProps = {
  preferredPlatformsCount: number;
  memberTier: string;
  joinedYear: string;
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[rgba(255,255,255,0.82)] p-4">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{value}</p>
    </div>
  );
}

export default function ProfileStatsCard({
  preferredPlatformsCount,
  memberTier,
  joinedYear,
}: ProfileStatsCardProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Tổng quan</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatTile label="Sàn ưu tiên" value={String(preferredPlatformsCount)} />
        <StatTile label="Hạng thành viên" value={memberTier} />
        <StatTile label="Năm tham gia" value={joinedYear} />
      </div>
    </div>
  );
}
