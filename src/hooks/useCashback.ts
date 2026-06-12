import { cashbackService } from "@/services/cashback.service";

export function useCashback() {
  return cashbackService.getCashbackPlatforms();
}
