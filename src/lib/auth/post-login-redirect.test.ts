import test from "node:test";
import assert from "node:assert/strict";

import { getSafePostLoginRedirect } from "./post-login-redirect";

test(
  "Phase 20H.4a post-login allowlist accepts /cashback?productUrl=... with a Shopee long URL",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const value = `/cashback?productUrl=${encodeURIComponent(productUrl)}`;

    const resolved = getSafePostLoginRedirect(value);

    assert.equal(
      resolved,
      `/cashback?productUrl=${encodeURIComponent(productUrl)}`,
      "the resolved return path must round-trip the encoded productUrl without dropping the query string",
    );
  },
);

test(
  "Phase 20H.4a post-login allowlist accepts /cashback?productUrl=... with a short URL",
  () => {
    const productUrl = "https://s.shopee.vn/9pcUY7UNn7";
    const value = `/cashback?productUrl=${encodeURIComponent(productUrl)}`;

    const resolved = getSafePostLoginRedirect(value);

    assert.equal(
      resolved,
      `/cashback?productUrl=${encodeURIComponent(productUrl)}`,
      "the resolved return path must round-trip the short-link productUrl",
    );
  },
);

test("Phase 20H.4a post-login allowlist accepts /cashback alone", () => {
  assert.equal(getSafePostLoginRedirect("/cashback"), "/cashback");
});

test(
  "Phase 20H.4a post-login allowlist still accepts the existing /app/** and /go/<shortCode> paths",
  () => {
    assert.equal(
      getSafePostLoginRedirect("/app/cashback?productUrl=foo"),
      "/app/cashback?productUrl=foo",
    );
    assert.equal(
      getSafePostLoginRedirect("/go/abc123XYZ01_xyz"),
      "/go/abc123XYZ01_xyz",
    );
  },
);

test(
  "Phase 20H.4a post-login allowlist rejects off-site origins",
  () => {
    assert.equal(
      getSafePostLoginRedirect(
        "https://attacker.example/cashback",
      ),
      "/app",
      "absolute URL pointing to another origin must be rejected",
    );
    assert.equal(
      getSafePostLoginRedirect("//attacker.example/cashback"),
      "/app",
      "protocol-relative URL pointing off-site must be rejected",
    );
  },
);

test(
  "Phase 20H.4a post-login allowlist rejects paths outside /app, /cashback, /go/",
  () => {
    assert.equal(
      getSafePostLoginRedirect("/admin"),
      "/app",
    );
    assert.equal(
      getSafePostLoginRedirect("/login"),
      "/app",
    );
    assert.equal(getSafePostLoginRedirect("/"), "/app");
    assert.equal(getSafePostLoginRedirect(""), "/app");
    assert.equal(getSafePostLoginRedirect(null), "/app");
  },
);

test(
  "Phase 20H.4a post-login allowlist rejects malformed input",
  () => {
    assert.equal(
      getSafePostLoginRedirect("not a url"),
      "/app",
    );
    assert.equal(
      getSafePostLoginRedirect("javascript:alert(1)"),
      "/app",
      "javascript: scheme must be rejected",
    );
  },
);
