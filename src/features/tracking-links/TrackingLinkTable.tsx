"use client";

import Link from "next/link";
import { useState } from "react";
import type { TrackingLinkView } from "@/types/affiliate";

type Props = {
  links: TrackingLinkView[];
};

export default function TrackingLinkTable({ links }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard API unavailable in this context
    }
  }

  return (
    <section className="pb-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {links.map((link) => (
          <article
            key={link.id}
            className="min-w-0 rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
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

            {/* Tracking link row — copy button uses trackingUrl */}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-[color:var(--text-muted)]">Link hoàn tiền</p>
                <p className="truncate font-mono text-xs text-[color:var(--text)]">{link.trackingUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(link.trackingUrl, link.id)}
                className="shrink-0 rounded-full border border-[rgba(124,63,44,0.12)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-strong)] transition-colors hover:border-[rgba(124,63,44,0.3)]"
              >
                {copiedId === link.id ? "Đã sao chép!" : "Sao chép"}
              </button>
            </div>

            {/* Destination URL row — shows destinationUrl */}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-[color:var(--text-muted)]">Trang đích</p>
                <p className="truncate font-mono text-xs text-[color:var(--text-muted)]">{link.destinationUrl}</p>
              </div>
              <a
                href={link.destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full border border-[rgba(124,63,44,0.12)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-strong)] transition-colors hover:border-[rgba(124,63,44,0.3)]"
              >
                Mở
              </a>
            </div>

            {/* Short code row */}
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Mã link</span>
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
