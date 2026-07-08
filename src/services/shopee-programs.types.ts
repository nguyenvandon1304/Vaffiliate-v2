/**
 * Phase 20H.7a -- shared types for the popular programs surface.
 *
 * These types are plain (no Drizzle, no React). They are the wire
 * format between the programs service, the mock future-cards
 * module, and the buyer-facing UI component.
 *
 * The discriminated union separates ACTIVE cards (backed by a
 * real catalog offer that can classify purchases) from COMING
 * SOON cards (display-only placeholders).
 */

export type ShopeeProgramPlatform = "shopee";

export type ShopeeProgramCardType =
  | "generic_affiliate"
  | "merchant_deal"
  | "traffic_source_campaign";

export interface ShopeeProgramCardBase {
  readonly id: string;
  readonly platform: ShopeeProgramPlatform;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly category: string;
  readonly displayOrder: number;
}

export interface ShopeeActiveProgramCard extends ShopeeProgramCardBase {
  readonly kind: "active";
  readonly programType: "generic_affiliate" | "merchant_deal";
  readonly campaignId: string;
  readonly offerId: string;
}

export interface ShopeeComingSoonProgramCard extends ShopeeProgramCardBase {
  readonly kind: "coming_soon";
  readonly programType: "traffic_source_campaign";
  readonly campaignId: null;
  readonly offerId: null;
  readonly safeNote: string;
}

export type ShopeeProgramCard =
  | ShopeeActiveProgramCard
  | ShopeeComingSoonProgramCard;

export interface ShopeeFutureProgramCardData {
  readonly id: string;
  readonly platform: ShopeeProgramPlatform;
  readonly programType: "traffic_source_campaign";
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly category: string;
  readonly displayOrderOffset: number;
  readonly safeNote: string;
}
