/**
 * Unit tests for the Shopee affiliate URL verifier.
 *
 * Run with:
 *
 *     node --import tsx --test src/lib/cashback/shopee-affiliate-url.test.ts
 *
 * The verifier is in shopee-affiliate-url-verifier.ts (no server-only guard)
 * so it can be imported directly by tests. The legacy redirect path uses
 * dependency injection so no production network code runs during tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ShopeeAffiliateUrlError,
  verifyShopeeAffiliateUrl,
} from "./shopee-affiliate-url-verifier";

import type {
  ShopeeAffiliateUrlErrorCode,
} from "./shopee-affiliate-url-verifier";

const VALID_ACCOUNT_ID = "an_123456";
const VALID_NETWORK_SUB_ID = "vaflnk0000000000000000000001ab";
const CANONICAL_URL =
  "https://shopee.vn/product/12345/67890";
const CANONICAL_URL_OTHER_PRODUCT =
  "https://shopee.vn/product/99999/11111";

function buildAnRedirUrl(overrides: {
  affiliateId?: string;
  subId?: string;
  originLink?: string;
  hostname?: string;
} = {}): string {
  const affiliateId = overrides.affiliateId ?? "123456";
  const subId =
    overrides.subId ??
    `${VALID_NETWORK_SUB_ID}-web-direct-na-na`;
  const originLink = overrides.originLink ?? CANONICAL_URL;
  const hostname = overrides.hostname ?? "s.shopee.vn";

  const params = new URLSearchParams({
    affiliate_id: affiliateId,
    sub_id: subId,
    origin_link: originLink,
  });

  return `https://${hostname}/an_redir?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// DETERMINISTIC /an_redir PATH — pure local validation, no network
// ---------------------------------------------------------------------------

test("valid deterministic /an_redir URL accepted without network fetch", async () => {
  const url = buildAnRedirUrl({});
  const result = await verifyShopeeAffiliateUrl(
    url,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
  assert.equal(
    (result as { originLink: string }).originLink,
    CANONICAL_URL,
  );
  assert.equal((result as { format: string }).format, "new");
});

test("wrong affiliate_id rejected", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ affiliateId: "999999" }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "account_mismatch");
});

test("missing affiliate_id rejected with missing_account_attribution", async () => {
  const params = new URLSearchParams({
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const urlWithoutAffiliateId =
    `https://s.shopee.vn/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    urlWithoutAffiliateId,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "missing_account_attribution");
});

test("wrong networkSubId in sub_id rejected", async () => {
  const wrongSubId =
    "vaflnk0000000000000000000009999-web-direct-na-na";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ subId: wrongSubId }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "sub_id_mismatch");
});

test("missing origin_link rejected", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
  });
  const urlWithoutOrigin =
    `https://s.shopee.vn/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    urlWithoutOrigin,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("invalid /an_redir pathname (wrong path) causes legacy redirect path to be used", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const url = `https://s.shopee.vn/wrong-path?${params.toString()}`;

  // Falls through to legacy path; without a resolver mock, the lazy
  // import will be attempted but since resolveRedirect is undefined
  // and we're not in a server context, the import may fail.
  // We just verify the result is not valid.
  const result = await verifyShopeeAffiliateUrl(
    url,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  // The legacy path tries to import the server-only resolver,
  // which will fail in test context → invalid_url
  assert.equal(result.valid, false);
});

test("same shopId/itemId with harmless slug/query difference accepted", async () => {
  const sameProductDiffSlug =
    "https://shopee.vn/product/12345/67890?utm_source=google&ref=sharing";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: sameProductDiffSlug }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
});

test("different shopId rejected", async () => {
  const diffProduct =
    "https://shopee.vn/product/99999/67890";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: diffProduct }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "product_mismatch");
});

test("different itemId rejected", async () => {
  const diffProduct =
    "https://shopee.vn/product/12345/99999";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: diffProduct }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "product_mismatch");
});

test("origin_link with HTTP protocol rejected", async () => {
  const httpOrigin =
    "http://shopee.vn/product/12345/67890";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: httpOrigin }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("origin_link pointing to non-Shopee domain rejected", async () => {
  const nonShopeeOrigin =
    "https://amazon.com/product/12345/67890";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: nonShopeeOrigin }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("non-Shopee short-link hostname rejected before any fetch", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const evilUrl = `https://evil.com/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    evilUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("invalid networkSubId format rejected early", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({}),
    "not-a-valid-subid",
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_network_sub_id");
});

test("completely malformed URL rejected", async () => {
  const result = await verifyShopeeAffiliateUrl(
    "this is not a url at all",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("origin_link with unparseable product path rejected", async () => {
  const unparseableOrigin =
    "https://shopee.vn/not-a-product-path";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: unparseableOrigin }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("valid accountId with digits-only affiliate_id accepted", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ affiliateId: "123456" }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
  assert.equal(
    (result as { accountId: string }).accountId,
    VALID_ACCOUNT_ID,
  );
});

test("s.shopee.com allowed as short-link hostname", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ hostname: "s.shopee.com" }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
});

test("subdomain of s.shopee.vn rejected before resolver", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const evilUrl = `https://foo.s.shopee.vn/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    evilUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("returned resolvedUrl equals input for /an_redir format", async () => {
  const url = buildAnRedirUrl({});
  const result = await verifyShopeeAffiliateUrl(
    url,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
  assert.equal(
    (result as { resolvedUrl: string }).resolvedUrl,
    url,
  );
});

test("origin_link from shope.ee domain rejected (not a canonical product host)", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({
      originLink: "https://shope.ee/product/12345/67890",
    }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("origin_link from shopee.com domain rejected (not a canonical product host)", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({
      originLink: "https://shopee.com/product/12345/67890",
    }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("subdomain origin_link rejected (subdomains not allowed)", async () => {
  const subdomainOrigin =
    "https://foo.shopee.vn/product/12345/67890";

  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ originLink: subdomainOrigin }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_origin_link");
});

test("result contains correct networkSubId and format for /an_redir", async () => {
  const url = buildAnRedirUrl({});
  const result = await verifyShopeeAffiliateUrl(
    url,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
  const verified = result as {
    networkSubId: string;
    format: string;
    utmSource: null;
    mmpPid: null;
    utmContent: null;
  };

  assert.equal(verified.networkSubId, VALID_NETWORK_SUB_ID);
  assert.equal(verified.format, "new");
  assert.equal(verified.utmSource, null);
  assert.equal(verified.mmpPid, null);
  assert.equal(verified.utmContent, null);
});

// ---------------------------------------------------------------------------
// INPUT URL BOUNDARY TESTS — protocol, credentials, port, subdomain
// ---------------------------------------------------------------------------

test("HTTP affiliate URL rejected before resolver", async () => {
  const httpUrl = "http://s.shopee.vn/an_redir?affiliate_id=123456&sub_id=x&origin_link=https://shopee.vn/product/1/2";

  const result = await verifyShopeeAffiliateUrl(
    httpUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
  assert.ok(result.errorMessage?.toLowerCase().includes("https"));
});

test("affiliate URL with credentials rejected before resolver", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const credUrl = `https://user:pass@s.shopee.vn/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    credUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
  assert.ok(result.errorMessage?.toLowerCase().includes("credential"));
});

test("affiliate URL with non-default port rejected before resolver", async () => {
  const params = new URLSearchParams({
    affiliate_id: "123456",
    sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    origin_link: CANONICAL_URL,
  });
  const portUrl = `https://s.shopee.vn:8080/an_redir?${params.toString()}`;

  const result = await verifyShopeeAffiliateUrl(
    portUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
  assert.ok(result.errorMessage?.toLowerCase().includes("port"));
});

// ---------------------------------------------------------------------------
// LEGACY REDIRECT PATH TESTS — use injected resolver mock
// ---------------------------------------------------------------------------

test("valid legacy redirect with correct utm_content Sub_id1 accepted", async () => {
  const mockResolve = async (_url: string): Promise<URL> => {
    void _url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      utm_content: `${VALID_NETWORK_SUB_ID}-extra-fields`,
      origin_link: CANONICAL_URL,
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const legacyUrl = "https://s.shopee.vn/abc123";

  const result = await verifyShopeeAffiliateUrl(
    legacyUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, true);
  // input used the legacy redirect path
  assert.equal((result as { format: string }).format, "legacy");
});

test("valid legacy redirect with sub_id param accepted", async () => {
  const mockResolve = async (_url: string): Promise<URL> => {
    void _url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
      origin_link: CANONICAL_URL,
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const legacyUrl = "https://s.shopee.vn/legacy";

  const result = await verifyShopeeAffiliateUrl(
    legacyUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, true);
  // input used the legacy redirect path
  assert.equal((result as { format: string }).format, "legacy");
});

test("unsafe legacy input host rejected before resolver is called", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    assert.fail("resolver should not be called for invalid hostname");
    throw new Error("unreachable");
  };

  const unsafeUrl = "https://evil.com/an_short_code";

  const result = await verifyShopeeAffiliateUrl(
    unsafeUrl,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("legacy URL with wrong utm_source rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: "an_999999",
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "account_mismatch");
});

test("legacy URL with wrong sub_id rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      sub_id: "vaflnk0000000000000000000009999-web-direct-na-na",
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "sub_id_mismatch");
});

test("legacy URL with mismatched product rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
      origin_link: CANONICAL_URL_OTHER_PRODUCT,
    });
    return new URL(
      `https://shopee.vn/product/99999/11111?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "product_mismatch");
});

test("legacy URL without attribution parameters rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    return new URL(
      `https://shopee.vn/product/12345/67890?foo=bar`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "missing_account_attribution");
});

test("legacy URL resolved to shopee.vn (product host) accepted", async () => {
  // Real scenario: resolver returns final product URL, not s.shopee.vn
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
      origin_link: CANONICAL_URL,
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, true);
  // input used the legacy redirect path
  assert.equal((result as { format: string }).format, "legacy");
});

test("legacy URL resolved to non-Shopee host rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    });
    return new URL(
      `https://evil.com/short?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("legacy URL resolver throws returns invalid_url", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    throw new Error("network failure");
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "invalid_url");
});

test("legacy URL with wrong affiliate_id in resolved URL rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      utm_source: VALID_ACCOUNT_ID,
      affiliate_id: "999999",
      sub_id: `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "account_mismatch");
});

test("legacy URL with wrong mmp_pid rejected", async () => {
  const mockResolve = async (url: string): Promise<URL> => {
    void url;
    const resolvedParams = new URLSearchParams({
      mmp_pid: "an_999999",
    });
    return new URL(
      `https://shopee.vn/product/12345/67890?${resolvedParams.toString()}`,
    );
  };

  const result = await verifyShopeeAffiliateUrl(
    "https://s.shopee.vn/legacy",
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
    mockResolve,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "account_mismatch");
});

// ---------------------------------------------------------------------------
// ShopeeAffiliateUrlError class
// ---------------------------------------------------------------------------

test("ShopeeAffiliateUrlError has correct name, code and message", () => {
  const error = new ShopeeAffiliateUrlError(
    "account_mismatch",
    "test error message",
  );

  assert.equal(error.name, "ShopeeAffiliateUrlError");
  assert.equal(error.code, "account_mismatch");
  assert.equal(error.message, "test error message");
});

test("ShopeeAffiliateUrlError works with all error codes", () => {
  const codes: Array<ShopeeAffiliateUrlErrorCode> = [
    "invalid_network_sub_id",
    "missing_account_attribution",
    "account_mismatch",
    "missing_sub_id",
    "sub_id_mismatch",
    "invalid_origin_link",
    "invalid_url",
    "product_mismatch",
    "unsupported_affiliate_format",
  ];

  for (const code of codes) {
    const error = new ShopeeAffiliateUrlError(code, `msg for ${code}`);
    assert.equal(error.code, code);
    assert.equal(error.message, `msg for ${code}`);
  }
});

test("VerifiedShopeeAffiliateUrl contains all expected fields for /an_redir", async () => {
  const url = buildAnRedirUrl({});
  const result = await verifyShopeeAffiliateUrl(
    url,
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, true);
  const verified = result as {
    affiliateUrl: string;
    resolvedUrl: string;
    accountId: string;
    networkSubId: string;
    originLink: string;
    utmSource: null;
    mmpPid: null;
    utmContent: null;
    format: string;
  };

  assert.equal(typeof verified.affiliateUrl, "string");
  assert.equal(typeof verified.resolvedUrl, "string");
  assert.equal(verified.accountId, VALID_ACCOUNT_ID);
  assert.equal(verified.networkSubId, VALID_NETWORK_SUB_ID);
  assert.equal(verified.originLink, CANONICAL_URL);
  assert.equal(verified.utmSource, null);
  assert.equal(verified.mmpPid, null);
  assert.equal(verified.utmContent, null);
  assert.equal(verified.format, "new");
});

test("VerificationFailure contains errorCode and optional errorMessage", async () => {
  const result = await verifyShopeeAffiliateUrl(
    buildAnRedirUrl({ affiliateId: "WRONG" }),
    VALID_NETWORK_SUB_ID,
    VALID_ACCOUNT_ID,
    CANONICAL_URL,
  );

  assert.equal(result.valid, false);
  const failure = result as {
    errorCode: string;
    errorMessage?: string;
  };

  assert.equal(failure.errorCode, "account_mismatch");
  assert.equal(typeof failure.errorMessage, "string");
});
