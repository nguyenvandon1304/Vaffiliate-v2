import type { ClickPlatform } from "@/types/click";

export type PayoutMethod = "bank";

export type PayoutAccountStatus =
  | "unverified"
  | "verified"
  | "rejected"
  | "disabled";

export interface PayoutAccount {
  method: PayoutMethod;
  provider: string;
  accountName: string;
  accountNumber: string;
  status: PayoutAccountStatus;
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
