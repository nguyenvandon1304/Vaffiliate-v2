import { API_ENDPOINTS } from "@/lib/constants/api";
import { moreMenuItems } from "@/lib/mock";

export function getMoreMenuItems() {
  void API_ENDPOINTS.USER.MORE_MENU;
  return moreMenuItems;
}
