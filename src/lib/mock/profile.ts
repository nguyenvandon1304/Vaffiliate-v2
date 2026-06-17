import type { PayoutAccount, Profile } from "@/types/profile";

export const payoutAccount: PayoutAccount = {
  method: "bank",
  provider: "Vietcombank",
  accountName: "NGUYEN MINH ANH",
  accountNumber: "0123456789",
  isVerified: true,
};

export const profile: Profile = {
  id: "usr_01",
  fullName: "Nguyễn Minh Anh",
  email: "minhanh@example.com",
  phone: "0901234567",
  avatarUrl: "/avatars/default.png",
  memberTier: "Thành viên Vàng",
  joinedAt: "2024-08-12",
  preferredPlatforms: ["Shopee", "TikTok Shop"],
  payoutAccount,
};
