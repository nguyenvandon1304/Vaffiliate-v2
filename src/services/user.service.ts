import { getUserDataAsync } from "@/repositories/user.repository";
import type { ApiResponse } from "@/types/api";
import type { UserData } from "@/types/user";

export function getUserDataServiceAsync(): Promise<ApiResponse<UserData>> {
  return getUserDataAsync();
}
