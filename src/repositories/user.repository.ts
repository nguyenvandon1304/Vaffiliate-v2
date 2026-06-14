import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { moreMenuItems } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { UserData } from "@/types/user";

export function getMoreMenuItems() {
  void API_ENDPOINTS.USER.MORE_MENU;
  return moreMenuItems;
}

export function getUserData(): UserData {
  return {
    menuItems: getMoreMenuItems(),
  };
}

export function getUserDataAsync(): Promise<ApiResponse<UserData>> {
  return apiClient.get(getUserData());
}
