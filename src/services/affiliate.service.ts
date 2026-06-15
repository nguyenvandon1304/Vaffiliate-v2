import { getAffiliateDataAsync } from "@/repositories/affiliate.repository";
import type { ApiResponse } from "@/types/api";
import type { AffiliateData } from "@/types/affiliate";

export const affiliateService = {
  getAffiliateDataAsync,
};

export function getAffiliateDataServiceAsync(): Promise<ApiResponse<AffiliateData>> {
  return getAffiliateDataAsync();
}
