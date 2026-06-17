import { getClickDataServiceAsync } from "@/services/click.service";
import type { ClickData } from "@/types/click";

export async function loadClickAsync(): Promise<ClickData> {
  const response = await getClickDataServiceAsync();
  return response.data;
}
