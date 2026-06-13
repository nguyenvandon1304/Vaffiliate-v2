import { API_ENDPOINTS } from "@/lib/constants/api";
import { cashbackPlatforms } from "@/lib/mock";

export function getCashbackPlatforms() {
  void API_ENDPOINTS.CASHBACK.PLATFORMS;
  return cashbackPlatforms;
}
