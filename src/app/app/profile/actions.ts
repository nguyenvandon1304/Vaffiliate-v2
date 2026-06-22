"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ClickPlatform } from "@/types/click";

type ProfileUpdateActionState = {
  success: boolean;
  message: string;
};

const supportedPlatforms = new Set<ClickPlatform>([
  "Shopee",
  "TikTok Shop",
]);

function readTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function readPreferredPlatforms(
  formData: FormData,
): ClickPlatform[] | null {
  const values = formData.getAll("preferredPlatforms");
  const stringValues = values.filter(
    (value): value is string => typeof value === "string",
  );

  if (stringValues.length !== values.length) {
    return null;
  }

  if (
    stringValues.some(
      (value) =>
        !supportedPlatforms.has(value as ClickPlatform),
    )
  ) {
    return null;
  }

  return Array.from(
    new Set(stringValues),
  ) as ClickPlatform[];
}

function isValidAvatarUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

export async function updateProfileAction(
  _previousState: ProfileUpdateActionState,
  formData: FormData,
): Promise<ProfileUpdateActionState> {
  const fullName = readTrimmedString(formData, "fullName");
  const phone = readTrimmedString(formData, "phone");
  const avatarUrl = readTrimmedString(formData, "avatarUrl");
  const preferredPlatforms =
    readPreferredPlatforms(formData);

  if (!fullName) {
    return {
      success: false,
      message: "H\u1ECD v\u00E0 t\u00EAn l\u00E0 b\u1EAFt bu\u1ED9c.",
    };
  }

  if (fullName.length > 120) {
    return {
      success: false,
      message:
        "H\u1ECD v\u00E0 t\u00EAn kh\u00F4ng \u0111\u01B0\u1EE3c v\u01B0\u1EE3t qu\u00E1 120 k\u00FD t\u1EF1.",
    };
  }

  if (phone.length > 30) {
    return {
      success: false,
      message:
        "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\u00F4ng \u0111\u01B0\u1EE3c v\u01B0\u1EE3t qu\u00E1 30 k\u00FD t\u1EF1.",
    };
  }

  if (
    avatarUrl.length > 2048 ||
    !isValidAvatarUrl(avatarUrl)
  ) {
    return {
      success: false,
      message:
        "\u0110\u01B0\u1EDDng d\u1EABn \u1EA3nh \u0111\u1EA1i di\u1EC7n kh\u00F4ng h\u1EE3p l\u1EC7.",
    };
  }

  if (!preferredPlatforms) {
    return {
      success: false,
      message:
        "N\u1EC1n t\u1EA3ng \u01B0u ti\u00EAn kh\u00F4ng h\u1EE3p l\u1EC7.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      message:
        "Phi\u00EAn \u0111\u0103ng nh\u1EADp \u0111\u00E3 h\u1EBFt h\u1EA1n.",
    };
  }

  const { data: updatedProfile, error: updateError } =
    await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        avatar_url: avatarUrl || null,
        preferred_platforms: preferredPlatforms,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id")
      .single();

  if (updateError || !updatedProfile) {
    console.error("Supabase profile update failed", {
      code: updateError?.code,
      message: updateError?.message,
    });

    return {
      success: false,
      message:
        "Kh\u00F4ng th\u1EC3 l\u01B0u th\u00F4ng tin h\u1ED3 s\u01A1.",
    };
  }

  revalidatePath("/app/profile");

  return {
    success: true,
    message:
      "\u0110\u00E3 l\u01B0u th\u00F4ng tin h\u1ED3 s\u01A1.",
  };
}
