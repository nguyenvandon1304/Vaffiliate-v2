import { userService } from "@/services/user.service";

export function useUser() {
  return userService.getUserData();
}
