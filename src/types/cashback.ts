import type { PlatformLabel } from "./common";

export interface CashbackPlatform {
  name: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
  description: string;
  cta: string;
}
