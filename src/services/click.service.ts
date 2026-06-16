import { getClickDataAsync } from "@/repositories/click.repository";
import type { ApiResponse } from "@/types/api";
import type { ClickData } from "@/types/click";

export const clickService = {
  getClickDataAsync,
};

export function getClickDataServiceAsync(): Promise<ApiResponse<ClickData>> {
  return getClickDataAsync();
}
