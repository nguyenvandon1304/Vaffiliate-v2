"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ClickPlatform } from "@/types/click";

type ProfileUpdateActionState = {
  success: boolean;
  message: string;
};

type PayoutAccountUpdateActionState = {
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

function normalizeAccountNumber(value: string) {
  return value.replace(/\s+/g, "");
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

export async function updatePayoutAccountAction(
  _previousState: PayoutAccountUpdateActionState,
  formData: FormData,
): Promise<PayoutAccountUpdateActionState> {
  const method = readTrimmedString(formData, "method");
  const provider = readTrimmedString(formData, "provider");
  const accountName = readTrimmedString(
    formData,
    "accountName",
  );
  const accountNumber = normalizeAccountNumber(
    readTrimmedString(formData, "accountNumber"),
  );

  if (method !== "bank") {
    return {
      success: false,
      message:
        "Ph\u01B0\u01A1ng th\u1EE9c nh\u1EADn ti\u1EC1n kh\u00F4ng h\u1EE3p l\u1EC7.",
    };
  }

  if (!provider) {
    return {
      success: false,
      message:
        "Ng\u00E2n h\u00E0ng l\u00E0 b\u1EAFt bu\u1ED9c.",
    };
  }

  if (provider.length > 120) {
    return {
      success: false,
      message:
        "T\u00EAn ng\u00E2n h\u00E0ng kh\u00F4ng \u0111\u01B0\u1EE3c v\u01B0\u1EE3t qu\u00E1 120 k\u00FD t\u1EF1.",
    };
  }

  if (!accountName) {
    return {
      success: false,
      message:
        "T\u00EAn ch\u1EE7 t\u00E0i kho\u1EA3n l\u00E0 b\u1EAFt bu\u1ED9c.",
    };
  }

  if (accountName.length > 120) {
    return {
      success: false,
      message:
        "T\u00EAn ch\u1EE7 t\u00E0i kho\u1EA3n kh\u00F4ng \u0111\u01B0\u1EE3c v\u01B0\u1EE3t qu\u00E1 120 k\u00FD t\u1EF1.",
    };
  }

  if (
    accountNumber &&
    !/^\d{6,34}$/.test(accountNumber)
  ) {
    return {
      success: false,
      message:
        "S\u1ED1 t\u00E0i kho\u1EA3n ph\u1EA3i g\u1ED3m t\u1EEB 6 \u0111\u1EBFn 34 ch\u1EEF s\u1ED1.",
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

  const updatePayload = {
    method,
    provider,
    account_name: accountName,
    ...(accountNumber
      ? { account_number: accountNumber }
      : {}),
    updated_at: new Date().toISOString(),
  };

  const {
    data: updatedAccount,
    error: updateError,
  } = await supabase
    .from("payout_accounts")
    .update(updatePayload)
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();

  if (updateError) {
    console.error("Supabase payout account update failed", {
      code: updateError.code,
      message: updateError.message,
    });

    return {
      success: false,
      message:
        "Kh\u00F4ng th\u1EC3 l\u01B0u t\u00E0i kho\u1EA3n nh\u1EADn ti\u1EC1n.",
    };
  }

  if (!updatedAccount) {
    if (!accountNumber) {
      return {
        success: false,
        message:
          "S\u1ED1 t\u00E0i kho\u1EA3n l\u00E0 b\u1EAFt bu\u1ED9c khi thi\u1EBFt l\u1EADp l\u1EA7n \u0111\u1EA7u.",
      };
    }

    const {
      data: insertedAccount,
      error: insertError,
    } = await supabase
      .from("payout_accounts")
      .insert({
        user_id: user.id,
        method,
        provider,
        account_name: accountName,
        account_number: accountNumber,
      })
      .select("user_id")
      .single();

    if (insertError || !insertedAccount) {
      console.error("Supabase payout account insert failed", {
        code: insertError?.code,
        message: insertError?.message,
      });

      return {
        success: false,
        message:
          "Kh\u00F4ng th\u1EC3 l\u01B0u t\u00E0i kho\u1EA3n nh\u1EADn ti\u1EC1n.",
      };
    }
  }

  revalidatePath("/app/profile");

  return {
    success: true,
    message:
      "\u0110\u00E3 l\u01B0u t\u00E0i kho\u1EA3n nh\u1EADn ti\u1EC1n.",
  };
}
