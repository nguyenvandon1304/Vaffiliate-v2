import { getMoreMenuItems, getUserData, getUserDataAsync } from "@/repositories/user.repository";
import type { ApiResponse } from "@/types/api";
import type { UserData } from "@/types/user";

export const userService = {
  getMoreMenuItems,
  getUserData,
  getUserDataAsync,
};

export function getUserDataService(): UserData {
  return getUserData();
}

export function getUserDataServiceAsync(): Promise<ApiResponse<UserData>> {
  return getUserDataAsync();
}
