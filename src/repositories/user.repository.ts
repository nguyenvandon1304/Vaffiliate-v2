import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { moreMenuItems } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { MoreMenuItem, UserData } from "@/types/user";

export function getMoreMenuItems() {
  void API_ENDPOINTS.USER.MORE_MENU;
  return moreMenuItems;
}

export function getUserData(): UserData {
  return {
    menuItems: getMoreMenuItems(),
  };
}

export async function getUserDataAsync(): Promise<ApiResponse<UserData>> {
  const menuItems = await apiClient.get<MoreMenuItem[]>(
    API_ENDPOINTS.USER.MORE_MENU
  );
  return {
    success: true,
    data: {
      menuItems: menuItems.data,
    },
  };
}
