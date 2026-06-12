type BrandLogoProps = {
  compact?: boolean;
};

export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="inline-flex items-center gap-3">
      <span
        className="relative flex items-center justify-center overflow-hidden rounded-[1.15rem] bg-[linear-gradient(135deg,var(--brand),var(--accent))] text-white shadow-[var(--shadow-glow)]"
        style={{
          width: compact ? "2.1rem" : "2.75rem",
          height: compact ? "2.1rem" : "2.75rem",
        }}
      >
        <span className="absolute inset-[1px] rounded-[1rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.34),transparent_58%)]" />
        <span className="relative text-sm font-semibold tracking-tight">V</span>
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-[-0.03em] text-[color:var(--text)]">
          Vaffiliate
        </span>
        {!compact ? (
          <span className="mt-1 text-xs text-[color:var(--text-muted)]">
            Hoàn tiền cho mua sắm online
          </span>
        ) : null}
      </div>
    </div>
  );
}
