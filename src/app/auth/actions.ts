"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function readRequiredString(formData: FormData, key: string) {
const value = formData.get(key);

if (typeof value !== "string" || !value.trim()) {
return null;
}

return value.trim();
}

async function getRequestOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return new URL(configuredSiteUrl).origin;
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) {
    return new URL(origin).origin;
  }

  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  if (!host) {
    throw new Error("Request host is required");
  }

  return new URL(`${protocol}://${host}`).origin;
}
function getSafeAppRedirect(value: string | null) {
  const fallbackPath = "/app";

  if (!value) {
    return fallbackPath;
  }

  try {
    const baseUrl = new URL("http://localhost");
    const redirectUrl = new URL(value, baseUrl);
    const isAppPath =
      redirectUrl.pathname === "/app" ||
      redirectUrl.pathname.startsWith("/app/");

    if (redirectUrl.origin !== baseUrl.origin || !isAppPath) {
      return fallbackPath;
    }

    return (
      redirectUrl.pathname +
      redirectUrl.search +
      redirectUrl.hash
    );
  } catch {
    return fallbackPath;
  }
}

export async function login(formData: FormData) {
  const email = readRequiredString(formData, "email");
  const password = readRequiredString(formData, "password");
  const next = getSafeAppRedirect(
    readRequiredString(formData, "next"),
  );

  if (!email || !password) {
    redirect("/login?error=missing-fields");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });

  if (error) {
    redirect("/login?error=invalid-credentials");
  }

  revalidatePath("/", "layout");
  redirect(next);
}
export async function signup(formData: FormData) {
const fullName = readRequiredString(formData, "fullName");
const email = readRequiredString(formData, "email");
const password = readRequiredString(formData, "password");
const acceptedTerms = formData.get("acceptedTerms") === "on";

if (!fullName || !email || !password || !acceptedTerms) {
redirect("/register?error=missing-fields");
}

if (password.length < 8) {
redirect("/register?error=weak-password");
}

const origin = await getRequestOrigin();
const supabase = await createClient();

const { data, error } = await supabase.auth.signUp({
email: email.toLowerCase(),
password,
options: {
emailRedirectTo: origin + "/auth/callback",
data: {
full_name: fullName,
},
},
});

if (error) {
  console.error("Supabase signup failed", {
    name: error.name,
    code: error.code,
    status: error.status,
    message: error.message,
  });

  redirect("/register?error=signup-failed");
}

revalidatePath("/", "layout");

if (data.session) {
redirect("/app");
}

redirect("/login?message=check-email");
}

export async function logout() {
const supabase = await createClient();

await supabase.auth.signOut();
revalidatePath("/", "layout");
redirect("/login");
}