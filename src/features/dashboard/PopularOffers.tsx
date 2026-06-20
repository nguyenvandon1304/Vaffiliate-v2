import Link from "next/link";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import type { PopularOffer } from "@/types/dashboard";

type PopularOffersProps = {
  offers: PopularOffer[];
};

function OfferCard({ offer }: { offer: PopularOffer }) {
  return (
    <Link
      href={`/app/cashback?offer=${offer.offerId}`}
      className="block rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)] transition-colors hover:border-[color:var(--brand)] hover:bg-[rgba(255,250,246,0.96)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[color:var(--text-muted)]">
            {offer.platform}
          </p>
          <p className="mt-0.5 truncate font-semibold text-[color:var(--text)]">
            {offer.title}
          </p>
          <p className="mt-1 truncate text-xs leading-5 text-[color:var(--text-muted)]">
            {offer.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
          {offer.rewardLabel}
        </span>
      </div>
      <p className="mt-2 text-xs text-[color:var(--text-muted)]">
        {offer.category}
      </p>
    </Link>
  );
}

export default function PopularOffers({ offers }: PopularOffersProps) {
  return (
    <Card className="p-5">
      <SectionHeader
        title="Chương trình phổ biến"
        description="Các chương trình đang hoạt động."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {offers.map((offer) => (
          <OfferCard key={offer.offerId} offer={offer} />
        ))}
      </div>
    </Card>
  );
}
