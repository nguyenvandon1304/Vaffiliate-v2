import type { PlatformLabel } from "./common";

export interface HomeMetric {
  label: string;
  value: string;
  note?: string;
}

export interface HomeFeature {
  title: string;
  description: string;
}

export interface HeroPreview {
  balance: string;
  monthlyCashback: string;
  upcomingPayout: string;
  stores: PlatformLabel[];
  upcomingStores: PlatformLabel[];
}

export interface DashboardSummary {
  greeting: string;
  title: string;
  description: string;
  availableCashback: string;
  pendingCashback: string;
  trackedOrders: string;
  tier: string;
  nextPayout: string;
  activePlatforms: PlatformLabel[];
  upcomingPlatforms: PlatformLabel[];
}

export interface QuickAction {
  title: string;
  subtitle: string;
  icon: string;
}
