"use client";

import { useActionState } from "react";

import {
  createCashbackTrackingLinkAction,
} from "@/app/app/cashback/actions";
import type {
  CreateCashbackTrackingLinkActionState,
  ShopeeProductPreview,
} from "@/types/cashback";

interface ShopeeCashbackPurchaseActionProps {
  preview: ShopeeProductPreview;
}

const initialActionState:
  CreateCashbackTrackingLinkActionState = {
    success: false,
    message: "",
    trackingLink: null,
  };

export default function ShopeeCashbackPurchaseAction({
  preview,
}: ShopeeCashbackPurchaseActionProps) {
  const [
    actionState,
    createTrackingLinkAction,
    isPending,
  ] = useActionState(
    createCashbackTrackingLinkAction,
    initialActionState,
  );

  const trackingLink =
    actionState.success
      ? actionState.trackingLink
      : null;

  const isReady =
    Boolean(trackingLink?.affiliateUrl);

  return (
    <div className="mt-5 border-t border-[rgba(124,63,44,0.09)] pt-5">
      <form action={createTrackingLinkAction}>
        <input
          type="hidden"
          name="platform"
          defaultValue="shopee"
        />

        <input
          type="hidden"
          name="destinationUrl"
          defaultValue={preview.productUrl}
        />

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending
            ? "Đang chuẩn bị link mua hàng..."
            : trackingLink
              ? "Kiểm tra lại link mua hàng"
              : "Tạo link mua hàng hoàn tiền"}
        </button>
      </form>

      {actionState.message ? (
        <p
          role={
            actionState.success
              ? "status"
              : "alert"
          }
          aria-live="polite"
          className={
            actionState.success
              ? "mt-3 text-sm leading-6 text-[color:var(--text-muted)]"
              : "mt-3 text-sm font-medium leading-6 text-[color:var(--warning)]"
          }
        >
          {actionState.message}
        </p>
      ) : null}

      {trackingLink && isReady ? (
        <a
          href={trackingLink.trackingPath}
          className="mt-3 flex w-full items-center justify-center rounded-[var(--radius-lg)] border border-[color:var(--brand)] bg-white/85 px-4 py-3 text-sm font-semibold text-[color:var(--brand-strong)] shadow-[var(--shadow-sm)] transition"
        >
          Mua ngay nhận hoàn tiền
        </a>
      ) : null}

      {trackingLink && !isReady ? (
        <p className="mt-3 rounded-[var(--radius-lg)] border border-[rgba(216,138,82,0.18)] bg-[rgba(216,138,82,0.08)] px-4 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
          Link hoàn tiền đã được ghi nhận.
          Hệ thống đang hoàn tất liên kết với
          Shopee trước khi mở nút mua hàng.
        </p>
      ) : null}
    </div>
  );
}
