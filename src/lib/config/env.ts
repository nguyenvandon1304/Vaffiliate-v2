export const env = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
} as const;

export function getApiUrl() {
  return env.NEXT_PUBLIC_API_URL || "";
}
