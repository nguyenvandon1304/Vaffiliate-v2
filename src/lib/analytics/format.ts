import type { ConversionStatus, SupportedPlatformLabel } from "@/types/affiliate";
import type { Money } from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

export const supportedPlatforms: Partial<Record<PlatformLabel, SupportedPlatformLabel>> = {
  Shopee: "Shopee",
  "TikTok Shop": "TikTok Shop",
};

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(money.amount);
}

export function parseOrderValue(orderValue: string): number {
  return Number(orderValue.replace(/[^\d]/g, ""));
}

export function parseRate(commissionRate: string): number {
  return Number(commissionRate.replace(/[^\d.]/g, ""));
}

export function formatDate(value: string): string {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function isPayableStatus(status: ConversionStatus): boolean {
  return status === "payable" || status === "paid";
}

export function isApprovedStatus(status: ConversionStatus): boolean {
  return status === "approved" || status === "payable" || status === "paid";
}
