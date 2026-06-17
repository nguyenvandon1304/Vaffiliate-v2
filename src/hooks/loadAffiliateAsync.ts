import { getAffiliateDataServiceAsync } from "@/services/affiliate.service";
import type { AffiliateData } from "@/types/affiliate";

export async function loadAffiliateAsync(): Promise<AffiliateData> {
  const response = await getAffiliateDataServiceAsync();
  return response.data;
}
