import test from "node:test";
import assert from "node:assert/strict";

import ShopeeProductPreviewBadge from "./ShopeeProductPreviewBadge";

test("Phase 20H.3d badge renders the label exactly", () => {
  const node = ShopeeProductPreviewBadge({
    label: "Hoàn lại đến 60% hoa hồng Shopee",
  });
  assert.ok(node);
  // The rendered object is a React element whose props.children carry
  // the label.
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (
      node as { props: { children: unknown } }
    ).props;
    assert.equal(props.children, "Hoàn lại đến 60% hoa hồng Shopee");
  }
});

test("Phase 20H.3d badge renders nothing else when label is empty", () => {
  const node = ShopeeProductPreviewBadge({ label: "" });
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (
      node as { props: { children: unknown } }
    ).props;
    assert.equal(props.children, "");
  }
});

test("Phase 20H.3d badge exposes a stable testid", () => {
  const node = ShopeeProductPreviewBadge({
    label: "Hoàn lại đến 60% hoa hồng Shopee",
  });
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (
      node as {
        props: { "data-testid"?: string; className?: string };
      }
    ).props;
    assert.equal(props["data-testid"], "shopee-product-preview-badge");
    assert.ok(
      typeof props.className === "string" &&
        props.className.includes("uppercase"),
    );
    assert.ok(
      typeof props.className === "string" &&
        props.className.includes("tracking"),
    );
  }
});