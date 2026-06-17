import { getProfileDataAsync } from "@/repositories/profile.repository";
import type { ApiResponse } from "@/types/api";
import type { ProfileData } from "@/types/profile";

export function getProfileDataServiceAsync(): Promise<ApiResponse<ProfileData>> {
  return getProfileDataAsync();
}
