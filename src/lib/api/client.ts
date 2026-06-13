import type { ApiResponse } from "@/types/api";

const ok = <T>(data: T): Promise<ApiResponse<T>> =>
  Promise.resolve({ success: true, data });

export const apiClient = {
  get: async <T>(data: T): Promise<ApiResponse<T>> => ok(data),
  post: async <T>(data: T): Promise<ApiResponse<T>> => ok(data),
  put: async <T>(data: T): Promise<ApiResponse<T>> => ok(data),
  delete: async <T>(data: T): Promise<ApiResponse<T>> => ok(data),
};
