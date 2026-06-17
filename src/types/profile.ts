import type { ClickPlatform } from "@/types/click";

export type PayoutMethod = "bank" | "ewallet";

export interface PayoutAccount {
  method: PayoutMethod;
  provider: string;
  accountName: string;
  accountNumber: string;
  isVerified: boolean;
}

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  memberTier: string;
  joinedAt: string;
  preferredPlatforms: ClickPlatform[];
  payoutAccount: PayoutAccount;
}

export interface ProfileData {
  profile: Profile;
}

export interface ProfileUpdateInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface PayoutAccountUpdateInput {
  method: PayoutMethod;
  provider: string;
  accountName: string;
  accountNumber: string;
}
