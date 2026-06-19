import type { ConversionStatus } from "@/types/affiliate";

export type ConsumerOrderStatus = ConversionStatus;

export interface StatusPresentation {
  label: string;
  description: string;
  variant: "default" | "success" | "warning" | "neutral" | "danger";
  icon: string;
}

const statusMap: Record<ConsumerOrderStatus, StatusPresentation> = {
  pending: {
    label: "Đang chờ",
    description: "Đơn đang chờ được đối soát bởi sàn.",
    variant: "warning",
    icon: "◷",
  },
  approved: {
    label: "Đã duyệt",
    description: "Đơn đã được sàn xác nhận, chờ chuyển sang có thể rút.",
    variant: "success",
    icon: "✓",
  },
  rejected: {
    label: "Không được duyệt",
    description: "Đơn không đáp ứng điều kiện ghi nhận của sàn.",
    variant: "danger",
    icon: "✗",
  },
  payable: {
    label: "Có thể rút",
    description: "Cashback đã sẵn sàng để rút về ví.",
    variant: "success",
    icon: "◔",
  },
  paid: {
    label: "Đã thanh toán",
    description: "Cashback đã được chuyển vào ví.",
    variant: "default",
    icon: "◔",
  },
};

export function getStatusPresentation(status: ConsumerOrderStatus): StatusPresentation {
  return statusMap[status];
}

export function getStatusLabel(status: ConsumerOrderStatus): string {
  return statusMap[status].label;
}

export function getStatusVariant(
  status: ConsumerOrderStatus,
): StatusPresentation["variant"] {
  return statusMap[status].variant;
}
