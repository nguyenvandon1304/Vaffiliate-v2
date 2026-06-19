import type {
  OrderStatus,
  OrderStatusFilter,
  } from "@/types/orders";

  export interface FilterChip {
  label: string;
  value: OrderStatusFilter;
  }

  export const FILTER_CHIPS: readonly FilterChip[] = [
  {
  label: "Tất cả",
  value: "all",
  },
  {
  label: "Đang xử lý",
  value: "pending",
  },
  {
  label: "Đã duyệt",
  value: "approved",
  },
  {
  label: "Không được duyệt",
  value: "rejected",
  },
  {
  label: "Có thể rút",
  value: "payable",
  },
  {
  label: "Đã thanh toán",
  value: "paid",
  },
  ];

  const FILTER_LABELS: Record<OrderStatusFilter, string> = {
  all: "Tất cả",
  pending: "Đang xử lý",
  approved: "Đã duyệt",
  rejected: "Không được duyệt",
  payable: "Có thể rút",
  paid: "Đã thanh toán",
  };

  export function isOrderStatusFilter(
  value: string,
  ): value is OrderStatusFilter {
  return (
  value === "all" ||
  value === "pending" ||
  value === "approved" ||
  value === "rejected" ||
  value === "payable" ||
  value === "paid"
  );
  }

  export function parseFilterParam(
  raw: string | string[] | null | undefined,
  ): OrderStatusFilter {
  if (!raw) {
  return "all";
  }

  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value || !isOrderStatusFilter(value)) {
  return "all";
  }

  return value;
  }

  export function filterValueToLabel(
  value: OrderStatusFilter,
  ): string {
  return FILTER_LABELS[value];
  }

  export function matchesOrderStatusFilter(
  status: OrderStatus,
  filter: OrderStatusFilter,
  ): boolean {
  switch (filter) {
  case "all":
  return true;


  case "pending":
    return status === "recorded" || status === "reconciling";

  case "approved":
    return status === "approved";

  case "rejected":
    return status === "rejected";

  case "payable":
    return status === "payable";

  case "paid":
    return status === "paid";

  }
  }
