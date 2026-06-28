import "server-only";

import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { getPublisherConversionsAsync } from "@/repositories/publisher-conversion.repository";
import type { AffiliateData } from "@/types/affiliate";

export async function loadPublisherAffiliateAsync(): Promise<
  AffiliateData
> {
  const [affiliateData, conversions] = await Promise.all([
    loadAffiliateAsync(),
    getPublisherConversionsAsync(),
  ]);

  return {
    ...affiliateData,
    conversions,
  };
}
