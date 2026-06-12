"use client";

import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";

const upcomingPlatforms = ["Shopee Food", "Lazada", "Tiki", "Sendo"];

type PlatformName = "Shopee" | "TikTok Shop";
type FlowStep = "idle" | "result" | "modal";

const platformLinks: Record<PlatformName, string> = {
  Shopee: "https://vaffiliate.vn/go/shopee?ref=demo-user&click_id=demo-click",
  "TikTok Shop": "https://vaffiliate.vn/go/tiktok-shop?ref=demo-user&click_id=demo-click",
};

const platformValidators: Record<PlatformName, string> = {
  Shopee: "shopee",
  "TikTok Shop": "tiktok",
};

const placeholders: Record<PlatformName, string> = {
  Shopee: "Dán link sản phẩm từ Shopee tại đây",
  "TikTok Shop": "Dán link sản phẩm từ TikTok Shop tại đây",
};

const invalidMsgs: Record<PlatformName, string> = {
  Shopee: "Bạn đang chọn Shopee. Vui lòng dán link sản phẩm Shopee hợp lệ.",
  "TikTok Shop": "Bạn đang chọn TikTok Shop. Vui lòng dán link sản phẩm TikTok Shop hợp lệ.",
};

export default function CashbackForm() {
  const [platform, setPlatform] = useState<PlatformName>("Shopee");
  const [inputLink, setInputLink] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<FlowStep>("idle");
  const [copyOk, setCopyOk] = useState(false);

  const link = useMemo(() => platformLinks[platform], [platform]);

  useEffect(() => {
    if (!copyOk) return;
    const timer = window.setTimeout(() => setCopyOk(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copyOk]);

  const reset = () => {
    setStep("idle");
    setInputLink("");
    setError("");
    setCopyOk(false);
  };

  const check = () => {
    setError("");
    const value = inputLink.trim();
    if (!value) {
      setError("Vui lòng dán link sản phẩm trước khi kiểm tra hoàn tiền.");
      return;
    }
    if (!value.toLowerCase().includes(platformValidators[platform])) {
      setError(invalidMsgs[platform]);
      return;
    }
    setStep("result");
  };

  const create = () => {
    setStep("modal");
    setCopyOk(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopyOk(true);
    } catch {
      setCopyOk(false);
    }
  };

  const open = () => window.open(link, "_blank", "noopener,noreferrer");
  const close = () => {
    setStep("idle");
    setCopyOk(false);
  };

  return (
    <>
      <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">
          Dán link sản phẩm để nhận hoàn tiền
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Sao chép link sản phẩm từ Shopee hoặc TikTok Shop, dán vào đây để Vaffiliate tạo link hoàn tiền cho bạn.
        </p>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Chọn nền tảng
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(["Shopee", "TikTok Shop"] as PlatformName[]).map((item) => {
              const active = platform === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setPlatform(item);
                    reset();
                  }}
                  className={`rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-semibold transition-all ${
                    active
                      ? "border-[color:var(--brand)] bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)] shadow-[var(--shadow-sm)]"
                      : "border-[rgba(124,63,44,0.12)] bg-white/80 text-[color:var(--text-muted)]"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="product-link"
            className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
          >
            Link sản phẩm
          </label>
          <input
            id="product-link"
            type="text"
            value={inputLink}
            onChange={(event) => {
              setInputLink(event.target.value);
              setError("");
            }}
            placeholder={placeholders[platform]}
            className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
          />
          <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            Hãy chọn đúng nền tảng trước khi dán link để Vaffiliate tạo link hoàn tiền chính xác.
          </p>
          {error ? (
            <p className="mt-2 text-sm font-medium text-[color:var(--warning)]">{error}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={check}
          className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
        >
          Kiểm tra hoàn tiền
        </button>
      </div>

      {step === "idle" ? (
        <EmptyState
          title="Chưa có dữ liệu hoàn tiền"
          description="Dán link sản phẩm và kiểm tra để tạo link hoàn tiền."
        />
      ) : null}

      {step === "result" || step === "modal" ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,248,242,0.92)] p-5 shadow-[var(--shadow-sm)]">
          <h3 className="text-base font-semibold text-[color:var(--text)]">
            Sản phẩm có thể tạo link hoàn tiền
          </h3>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-[color:var(--text-muted)]">Sàn</span>
              <span className="font-semibold text-[color:var(--text)]">{platform}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[color:var(--text-muted)]">Trạng thái</span>
              <span className="font-semibold text-[color:var(--success)]">
                Có thể tạo link hoàn tiền
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[color:var(--text-muted)]">Ghi nhận đơn</span>
              <span className="font-semibold text-[color:var(--text)]">24–72h</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[color:var(--text-muted)]">Hoàn tiền</span>
              <span className="font-semibold text-[color:var(--text)]">
                Sau khi hoa hồng được sàn duyệt
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={create}
            className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
          >
            Tạo link hoàn tiền
          </button>
        </div>
      ) : null}

      {step === "modal" ? (
        <div className="fixed inset-0 z-50 bg-[rgba(36,24,21,0.44)] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label="Đóng"
            onClick={close}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[calc(var(--radius-2xl)+0.1rem)] border border-[rgba(124,63,44,0.12)] bg-[linear-gradient(180deg,rgba(255,252,249,0.98),rgba(248,238,231,0.98))] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[var(--shadow-lg)] md:left-1/2 md:top-1/2 md:bottom-auto md:w-full md:max-w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[calc(var(--radius-2xl)+0.1rem)] md:px-6 md:pb-6 md:pt-6">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[rgba(124,63,44,0.14)] md:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[color:var(--text-muted)]">
                  Link hoàn tiền đã sẵn sàng
                </p>
                <h2 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                  {platform}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)]"
              >
                Đóng
              </button>
            </div>
            <div className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.82)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Link gốc
              </p>
              <p className="mt-1 break-all text-sm text-[color:var(--text)]">{inputLink}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Link hoàn tiền
              </p>
              <div className="mt-1 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.12)] bg-white/90 px-4 py-3 text-sm leading-6 text-[color:var(--text)] break-all">
                {link}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={copy}
                className="rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={open}
                className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.12)] bg-white/80 px-4 py-3 text-sm font-semibold text-[color:var(--text)] shadow-[var(--shadow-sm)]"
              >
                Mua qua link hoàn tiền
              </button>
            </div>
            {copyOk ? (
              <p className="mt-3 text-sm font-medium text-[color:var(--brand-strong)]">
                Đã copy link hoàn tiền
              </p>
            ) : null}
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.86)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Mở trên điện thoại / QR
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 rounded-[var(--radius-lg)] bg-[linear-gradient(135deg,rgba(216,138,82,0.14),rgba(124,63,44,0.08))]" />
                <p className="text-sm leading-6 text-[color:var(--text-muted)]">
                  QR sẽ được tạo từ link hoàn tiền này để bạn mở trên điện thoại.
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,250,246,0.78)] px-4 py-3 text-xs leading-5 text-[color:var(--text-muted)] shadow-[var(--shadow-sm)]">
              Hãy mua hàng qua link vừa tạo và hạn chế chuyển sang link khác trước khi thanh toán để đơn có cơ hội được ghi nhận.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
