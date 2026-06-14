import { getUserDataServiceAsync } from "@/services/user.service";
import type { UserData } from "@/types/user";

export async function useUserAsync(): Promise<UserData> {
  const response = await getUserDataServiceAsync();
  return response.data;
}
