import { getMoreMenuItems, getUserData } from "@/repositories/user.repository";
import type { UserData } from "@/types/user";

export const userService = {
  getMoreMenuItems,
  getUserData,
};

export function getUserDataService(): UserData {
  return getUserData();
}
