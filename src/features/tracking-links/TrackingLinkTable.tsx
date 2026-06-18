import Link from "next/link";
import type { TrackingLinkView } from "@/types/affiliate";

export default function TrackingLinkTable({ links }: { links: TrackingLinkView[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {links.map((link) => (
          <article
            key={link.id}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[color:var(--text)]">{link.offerTitle}</p>
                <Link
                  href={`/app/campaigns/${link.campaignId}`}
                  className="mt-1 inline-block text-sm font-medium text-[color:var(--brand)] underline-offset-4 hover:underline"
                >
                  {link.campaignName}
                </Link>
              </div>
              <p className="text-sm font-semibold text-[color:var(--success)]">
                {link.commissionRate}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {link.platform}
              </span>
              <span className="font-medium text-[color:var(--text-muted)]">{link.advertiserName}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Mã tracking</span>
              <Link
                href={`/app/tracking-links/${link.id}`}
                className="font-semibold text-[color:var(--brand)] underline-offset-4 hover:underline"
              >
                {link.shortCode}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
