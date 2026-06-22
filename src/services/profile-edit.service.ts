import { savePayoutAccountAsync } from "@/repositories/profile-edit.repository";
import type { PayoutAccountUpdateInput } from "@/types/profile";

export async function savePayoutAccountServiceAsync(
  input: PayoutAccountUpdateInput,
) {
  return savePayoutAccountAsync(input);
}
