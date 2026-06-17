import { getUserDataServiceAsync } from "@/services/user.service";
import type { UserData } from "@/types/user";

export async function loadUserAsync(): Promise<UserData> {
  const response = await getUserDataServiceAsync();
  return response.data;
}
