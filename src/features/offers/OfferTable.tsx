import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { OfferPlatform, OfferView } from "@/types/affiliate";

const platformLabels: Record<OfferPlatform, string> = {
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};

const statusLabels: Record<OfferView["status"], string> = {
  draft: "Bản nháp",
  active: "Đang chạy",
  paused: "Tạm dừng",
  ended: "Đã kết thúc",
};

export default function OfferTable({ offers }: { offers: OfferView[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {offers.map((offer) => (
          <article
            key={offer.id}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[color:var(--text)]">{offer.title}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {offer.category}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--success)]">
                {offer.commissionRate}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {platformLabels[offer.platform]}
              </span>
              <Badge>{statusLabels[offer.status]}</Badge>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Chiến dịch</span>
              <Link
                href={`/app/campaigns/${offer.campaignId}`}
                className="font-semibold text-[color:var(--brand)] underline-offset-4 hover:underline"
              >
                {offer.campaignName}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
