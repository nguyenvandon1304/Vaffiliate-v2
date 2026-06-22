import { createBrowserClient } from "@supabase/ssr";

function getSupabaseConfig() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
throw new Error("Supabase public environment variables are required");
}

return { url, publishableKey };
}

export function createClient() {
const { url, publishableKey } = getSupabaseConfig();

return createBrowserClient(url, publishableKey);
}
