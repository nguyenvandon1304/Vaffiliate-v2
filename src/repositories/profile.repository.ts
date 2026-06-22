import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { createClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/api";
import type { ClickPlatform } from "@/types/click";
import type {
PayoutAccount,
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

const supportedPlatforms = new Set([
"Shopee",
"TikTok Shop",
]);

function toClickPlatforms(values: string[]): ClickPlatform[] {
return values.filter(
(value): value is ClickPlatform =>
supportedPlatforms.has(value),
);
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

export async function getProfileDataAsync(): Promise<ApiResponse<ProfileData>> {
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
apiClient.get<PayoutAccount>(
  API_ENDPOINTS.PROFILE.PAYOUT_ACCOUNT,
),
]);

const profileRow = profileResult.data as ProfileRow | null;

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
const profile: Profile = {
id: user.id,
fullName: resolveFullName(
profileRow.full_name,
user.user_metadata.full_name,
),
email: user.email ?? "",
phone: profileRow.phone ?? "",
avatarUrl: profileRow.avatar_url ?? undefined,
memberTier: profileRow.member_tier,
joinedAt: profileRow.created_at,
preferredPlatforms: toClickPlatforms(
profileRow.preferred_platforms,
),
payoutAccount: payoutAccountResult.data,
};

return {
success: true,
data: {
profile,
},
};
}