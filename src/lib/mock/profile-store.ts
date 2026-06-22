import { payoutAccount as basePayoutAccount, profile as baseProfile } from "@/lib/mock/profile";
import type {
  PayoutAccount,
  PayoutAccountUpdateInput,
  Profile,
} from "@/types/profile";

let currentProfile: Profile = {
  ...baseProfile,
  payoutAccount: { ...basePayoutAccount },
};

export function getMockProfile(): Profile {
  return {
    ...currentProfile,
    payoutAccount: { ...currentProfile.payoutAccount },
  };
}

export function updateMockPayoutAccount(input: PayoutAccountUpdateInput): PayoutAccount {
  currentProfile = {
    ...currentProfile,
    payoutAccount: {
      ...currentProfile.payoutAccount,
      ...input,
    },
  };
  return { ...currentProfile.payoutAccount };
}
