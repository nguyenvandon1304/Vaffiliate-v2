import { savePayoutAccountAsync, saveProfileEditAsync } from "@/repositories/profile-edit.repository";
import type { PayoutAccountUpdateInput, ProfileUpdateInput } from "@/types/profile";

export async function saveProfileEditServiceAsync(input: ProfileUpdateInput) {
  return saveProfileEditAsync(input);
}

export async function savePayoutAccountServiceAsync(input: PayoutAccountUpdateInput) {
  return savePayoutAccountAsync(input);
}
