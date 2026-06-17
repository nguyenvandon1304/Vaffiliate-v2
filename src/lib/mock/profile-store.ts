import { payoutAccount as basePayoutAccount, profile as baseProfile } from "@/lib/mock/profile";
import type {
  PayoutAccount,
  PayoutAccountUpdateInput,
  Profile,
  ProfileUpdateInput,
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

export function updateMockProfile(input: ProfileUpdateInput): Profile {
  currentProfile = {
    ...currentProfile,
    ...input,
  };
  return getMockProfile();
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
