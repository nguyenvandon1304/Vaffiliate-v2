import type {
  DecimalVndString,
  PayoutEventType,
  PayoutOwnerReasonCode,
  PayoutStatus,
} from "@/types/payout";

export type PayoutBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "neutral"
  | "danger";

type StatusPresentation = {
  readonly label: string;
  readonly description: string;
  readonly variant: PayoutBadgeVariant;
};

const STATUS_PRESENTATION: Readonly<Record<PayoutStatus, StatusPresentation>> = {
  requested: {
    label: "Đã gửi",
    description: "Yêu cầu đã được ghi nhận và đang chờ xem xét.",
    variant: "default",
  },
  approved: {
    label: "Đã duyệt",
    description: "Yêu cầu đã được duyệt để chuyển sang bước xử lý.",
    variant: "success",
  },
  processing: {
    label: "Đang xử lý",
    description: "Khoản thanh toán đang được xử lý tới tài khoản đã chọn.",
    variant: "warning",
  },
  review_required: {
    label: "Cần kiểm tra",
    description: "Kết quả thanh toán cần được kiểm tra thêm trước khi hoàn tất.",
    variant: "warning",
  },
  paid: {
    label: "Đã thanh toán",
    description: "Khoản thanh toán đã được xác nhận hoàn tất.",
    variant: "success",
  },
  rejected: {
    label: "Bị từ chối",
    description: "Yêu cầu không được duyệt và khoản đã giữ được giải phóng.",
    variant: "danger",
  },
  cancelled: {
    label: "Đã hủy",
    description: "Bạn đã hủy yêu cầu trước khi yêu cầu được duyệt.",
    variant: "neutral",
  },
  failed: {
    label: "Không hoàn tất",
    description: "Khoản thanh toán không hoàn tất và cần xem lại trạng thái.",
    variant: "danger",
  },
};

const EVENT_LABELS: Readonly<Record<PayoutEventType, string>> = {
  request_created: "Đã tạo yêu cầu",
  request_approved: "Đã duyệt yêu cầu",
  request_rejected: "Đã từ chối yêu cầu",
  request_cancelled: "Đã hủy yêu cầu",
  processing_started: "Bắt đầu xử lý",
  outcome_uncertain: "Chuyển sang kiểm tra",
  payment_confirmed: "Đã xác nhận thanh toán",
  nonpayment_confirmed: "Đã xác nhận không thanh toán",
};

const OWNER_REASON_LABELS: Readonly<Record<PayoutOwnerReasonCode, string>> = {
  user_cancelled: "Bạn đã hủy yêu cầu.",
  request_rejected: "Yêu cầu không được duyệt.",
  payment_under_review: "Kết quả thanh toán đang được kiểm tra.",
  payment_not_completed: "Khoản thanh toán không hoàn tất.",
};

export function getPayoutStatusPresentation(
  status: PayoutStatus,
): StatusPresentation {
  return STATUS_PRESENTATION[status];
}

export function getPayoutEventLabel(eventType: PayoutEventType): string {
  return EVENT_LABELS[eventType];
}

export function getPayoutOwnerReasonLabel(
  reasonCode: PayoutOwnerReasonCode | null,
): string | null {
  return reasonCode === null ? null : OWNER_REASON_LABELS[reasonCode];
}

/** Format a validated decimal VND string without numeric conversion. */
export function formatPayoutVnd(value: DecimalVndString): string {
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
}

export function formatPayoutDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
