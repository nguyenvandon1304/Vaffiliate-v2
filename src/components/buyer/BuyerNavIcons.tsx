import type { ComponentType } from "react";

import type { BuyerNavIconId } from "./buyerNav";

type NavIconProps = {
  className?: string;
};

/**
 * Phase 20I.8 -- buyer navigation icon set. Inline SVGs only, so
 * the buyer chrome stays a small client bundle without bringing
 * in an icon library. The visual style matches the existing
 * `src/components/app/NavIcons.tsx` (currentColor, 24x24, 2px
 * stroke). Each icon is decorative by virtue of the icon-aria
 * label being placed on the link, so consumers should keep the
 * `<svg aria-hidden="true">` pair set in the producer below.
 */
function HomeIcon({ className }: NavIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TagIcon({ className }: NavIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 13 11 22l-9-9V2h11l7 7a3 3 0 0 1 0 4Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function CashbackIcon({ className }: NavIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="15" r="6" />
      <path d="M9 6v6" />
      <path d="M7.5 7.5h2.25a1.25 1.25 0 0 1 0 2.5H8.25a1.25 1.25 0 0 0 0 2.5H10.5" />
    </svg>
  );
}

function ReceiptIcon({ className }: NavIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </svg>
  );
}

function UserIcon({ className }: NavIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

export const buyerNavIconById: Record<
  BuyerNavIconId,
  ComponentType<NavIconProps>
> = {
  home: HomeIcon,
  tag: TagIcon,
  cashback: CashbackIcon,
  receipt: ReceiptIcon,
  user: UserIcon,
};
