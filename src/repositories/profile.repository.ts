import { createClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/api";
import type { ClickPlatform } from "@/types/click";
import type {
  PayoutAccount,
  PayoutAccountStatus,
  PayoutMethod,
  Profile,
  ProfileData,
} from "@/types/profile";

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  member_tier: string;
  preferred_platforms: string[];
  created_at: string;
};

type PayoutAccountRow = {
  method: string;
  provider: string;
  account_name: string;
  account_number: string;
  status: string;
};

const supportedPlatforms = new Set<ClickPlatform>([
  "Shopee",
  "TikTok Shop",
]);

const supportedPayoutStatuses =
  new Set<PayoutAccountStatus>([
    "unverified",
    "verified",
    "rejected",
    "disabled",
  ]);

function toClickPlatforms(
  values: string[],
): ClickPlatform[] {
  return values.filter(
    (value): value is ClickPlatform =>
      supportedPlatforms.has(value as ClickPlatform),
  );
}

function toPayoutMethod(value: string): PayoutMethod {
  return value === "bank" ? value : "bank";
}

function toPayoutAccountStatus(
  value: string,
): PayoutAccountStatus {
  return supportedPayoutStatuses.has(
    value as PayoutAccountStatus,
  )
    ? (value as PayoutAccountStatus)
    : "unverified";
}

function maskAccountNumber(value: string) {
  const lastFourDigits = value.slice(-4);

  return lastFourDigits
    ? `****${lastFourDigits}`
    : "";
}

function resolveFullName(
  databaseFullName: string | null,
  metadataFullName: unknown,
) {
  const storedFullName = databaseFullName?.trim();

  if (storedFullName) {
    return storedFullName;
  }

  if (
    typeof metadataFullName === "string" &&
    metadataFullName.trim()
  ) {
    return metadataFullName.trim();
  }

  return "Thành viên Vaffiliate";
}

export async function getProfileDataAsync(): Promise<
  ApiResponse<ProfileData>
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Authenticated user is required");
  }

  const [profileResult, payoutAccountResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          [
            "user_id",
            "full_name",
            "phone",
            "avatar_url",
            "member_tier",
            "preferred_platforms",
            "created_at",
          ].join(","),
        )
        .eq("user_id", user.id)
        .single(),

      supabase
        .from("payout_accounts")
        .select(
          [
            "method",
            "provider",
            "account_name",
            "account_number",
            "status",
          ].join(","),
        )
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const profileRow =
    profileResult.data as ProfileRow | null;

  if (profileResult.error || !profileRow) {
    console.error(
      "Supabase profile load failed",
      JSON.stringify({
        hasProfileData: Boolean(profileResult.data),
        error: profileResult.error
          ? {
              code: profileResult.error.code,
              message: profileResult.error.message,
              details: profileResult.error.details,
              hint: profileResult.error.hint,
            }
          : null,
      }),
    );

    throw new Error("Unable to load profile");
  }

  if (payoutAccountResult.error) {
    console.error(
      "Supabase payout account load failed",
      {
        code: payoutAccountResult.error.code,
        message: payoutAccountResult.error.message,
      },
    );

    throw new Error("Unable to load payout account");
  }

  const payoutAccountRow =
    payoutAccountResult.data as PayoutAccountRow | null;

  const payoutAccount: PayoutAccount =
    payoutAccountRow
      ? {
          method: toPayoutMethod(
            payoutAccountRow.method,
          ),
          provider: payoutAccountRow.provider,
          accountName:
            payoutAccountRow.account_name,
          accountNumber: maskAccountNumber(
            payoutAccountRow.account_number,
          ),
          status: toPayoutAccountStatus(
            payoutAccountRow.status,
          ),
        }
      : {
          method: "bank",
          provider: "",
          accountName: "",
          accountNumber: "",
          status: "unverified",
        };

  const profile: Profile = {
    id: user.id,
    fullName: resolveFullName(
      profileRow.full_name,
      user.user_metadata.full_name,
    ),
    email: user.email ?? "",
    phone: profileRow.phone ?? "",
    avatarUrl:
      profileRow.avatar_url ?? undefined,
    memberTier: profileRow.member_tier,
    joinedAt: profileRow.created_at,
    preferredPlatforms: toClickPlatforms(
      profileRow.preferred_platforms,
    ),
    payoutAccount,
  };

  return {
    success: true,
    data: {
      profile,
    },
  };
}
