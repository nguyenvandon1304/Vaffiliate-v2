import { getProfileDataServiceAsync } from "@/services/profile.service";
import type { ProfileData } from "@/types/profile";

export async function loadProfileAsync(): Promise<ProfileData> {
  const response = await getProfileDataServiceAsync();
  return response.data;
}
