import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { MoreMenuItem, UserData } from "@/types/user";

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
