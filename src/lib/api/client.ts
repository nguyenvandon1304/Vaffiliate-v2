import { resolveMockEndpoint } from "@/lib/api/mock-backend";
import type { ApiResponse } from "@/types/api";

const ok = <T>(data: T): Promise<ApiResponse<T>> =>
  Promise.resolve({ success: true, data });

export const apiClient = {
  get: async <T>(endpoint: string): Promise<ApiResponse<T>> =>
    ok(resolveMockEndpoint(endpoint) as T),
  post: async <T>(endpoint: string, body: T): Promise<ApiResponse<T>> => {
    void endpoint;
    return ok(body);
  },
  put: async <T>(endpoint: string, body: T): Promise<ApiResponse<T>> => {
    void endpoint;
    return ok(body);
  },
  delete: async <T>(endpoint: string, body: T): Promise<ApiResponse<T>> => {
    void endpoint;
    return ok(body);
  },
};
