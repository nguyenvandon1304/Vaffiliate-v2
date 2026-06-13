import { API_ENDPOINTS } from "@/lib/constants/api";
import { moreMenuItems } from "@/lib/mock";
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
