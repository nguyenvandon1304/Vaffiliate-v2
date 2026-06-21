"use client";

import { useState } from "react";

type Props = {
  url: string;
};

export default function CopyTrackingLinkButton({ url }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in this context.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-[rgba(124,63,44,0.12)] px-4 py-2 text-sm font-semibold text-[color:var(--brand-strong)] transition-colors hover:border-[rgba(124,63,44,0.3)]"
    >
      {copied ? "\u0110\u00e3 sao ch\u00e9p!" : "Sao ch\u00e9p"}
    </button>
  );
}
