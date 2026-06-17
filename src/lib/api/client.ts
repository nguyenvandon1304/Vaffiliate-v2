import { resolveMockEndpoint } from "@/lib/api/mock-backend";
import type { ApiResponse } from "@/types/api";

const ok = <T>(data: T): Promise<ApiResponse<T>> =>
  Promise.resolve({ success: true, data });

export const apiClient = {
  get: async <TResponse>(endpoint: string): Promise<ApiResponse<TResponse>> =>
    ok(resolveMockEndpoint(endpoint) as TResponse),
  post: async <TResponse, TBody = unknown>(
    endpoint: string,
    body: TBody,
  ): Promise<ApiResponse<TResponse>> => {
    if (typeof resolveMockEndpoint(endpoint) !== "undefined") {
      return ok(resolveMockEndpoint(endpoint) as TResponse);
    }
    void body;
    return ok(body as unknown as TResponse);
  },
  put: async <TResponse, TBody = unknown>(
    endpoint: string,
    body: TBody,
  ): Promise<ApiResponse<TResponse>> => {
    if (typeof resolveMockEndpoint(endpoint) !== "undefined") {
      return ok(resolveMockEndpoint(endpoint) as TResponse);
    }
    void body;
    return ok(body as unknown as TResponse);
  },
  delete: async <TResponse, TBody = unknown>(
    endpoint: string,
    body: TBody,
  ): Promise<ApiResponse<TResponse>> => {
    void endpoint;
    return ok(body as unknown as TResponse);
  },
};
