export function buildPasswordResetRedirect(origin: string): string {
  const callbackUrl = new URL("/auth/callback", new URL(origin).origin);
  callbackUrl.searchParams.set("next", "/reset-password");
  return callbackUrl.toString();
}

interface PasswordResetDependencies {
  getOrigin: () => Promise<string>;
  createClient: () => Promise<{
    auth: {
      resetPasswordForEmail: (
        email: string,
        options: { redirectTo: string },
      ) => Promise<{ error: unknown }>;
    };
  }>;
}

// Return only fixed public destinations. Never propagate provider errors,
// account existence, email addresses or connection details to the UI/logs.
export async function requestPasswordResetRedirect(
  formData: FormData,
  dependencies: PasswordResetDependencies,
): Promise<string> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return "/login?error=missing-email";
  }

  try {
    const origin = await dependencies.getOrigin();
    const supabase = await dependencies.createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: buildPasswordResetRedirect(origin) },
    );
    if (error) return "/login?error=reset-email-failed";
    return "/login?message=reset-email-sent";
  } catch {
    return "/login?error=reset-email-failed";
  }
}
