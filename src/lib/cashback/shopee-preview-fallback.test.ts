import test from "node:test";
import assert from "node:assert/strict";

import {
  createShopeePreviewFallbackDecision,
  isShopeePreviewPurchaseAllowedFailure,
  SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES,
} from "./shopee-preview-fallback";

test("isShopeePreviewPurchaseAllowedFailure returns true for metadata_incomplete", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("metadata_incomplete"),
    true,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns true for metadata_unavailable", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("metadata_unavailable"),
    true,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns true for provider_timeout", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("provider_timeout"),
    true,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns true for provider_response_invalid", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("provider_response_invalid"),
    true,
  );
});

test("SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES contains all safe failures", () => {
  assert.ok(
    SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES.includes("metadata_incomplete"),
  );
  assert.ok(
    SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES.includes("metadata_unavailable"),
  );
  assert.ok(
    SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES.includes("provider_timeout"),
  );
  assert.ok(
    SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES.includes(
      "provider_response_invalid",
    ),
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns false for invalid_input", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("invalid_input"),
    false,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns false for invalid_url", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("invalid_url"),
    false,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns false for unsupported_host", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("unsupported_host"),
    false,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns false for not_product_url", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("not_product_url"),
    false,
  );
});

test("isShopeePreviewPurchaseAllowedFailure returns false for product_not_found", () => {
  assert.equal(
    isShopeePreviewPurchaseAllowedFailure("product_not_found"),
    false,
  );
});

test(
  "isShopeePreviewPurchaseAllowedFailure returns false for product_unavailable",
  () => {
    assert.equal(
      isShopeePreviewPurchaseAllowedFailure("product_unavailable"),
      false,
    );
  },
);

test(
  "createShopeePreviewFallbackDecision allows fallback for metadata_incomplete",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.state,
        "metadata_incomplete_purchase_allowed",
      );
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision allows fallback for metadata_unavailable",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_unavailable",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.state,
        "metadata_unavailable_purchase_allowed",
      );
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision allows fallback for provider_timeout",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "provider_timeout",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.state,
        "metadata_unavailable_purchase_allowed",
      );
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision allows fallback for provider_response_invalid",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "provider_response_invalid",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.state,
        "metadata_unavailable_purchase_allowed",
      );
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision returns no product or quote fields",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal("product" in result, false);
      assert.equal("quote" in result, false);
      assert.equal("cashbackShareBps" in result, false);
      assert.equal("estimatedCashbackVnd" in result, false);
    }
  },
);

test(
  "createShopeePreviewFallbackDecision normalizes slug URL to canonical",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://shopee.vn/ao-thun-nam-i.12345.67890",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for invalid_input",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "invalid_input",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for invalid_url",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "invalid_url",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for unsupported_host",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "unsupported_host",
      "https://amazon.com/product/123",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for not_product_url",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "not_product_url",
      "https://shopee.vn/some-page",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for product_not_found",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "product_not_found",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for product_unavailable",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "product_unavailable",
      "https://shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision allows fallback with resolved canonical URL",
  () => {
    const resolvedCanonical =
      "https://shopee.vn/product/12345/67890";

    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      resolvedCanonical,
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/12345/67890",
      );
    }
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for raw short URLs",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://s.shopee.vn/shortlink",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for shopee.com URL",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://shopee.com/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for shope.ee URL",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://shope.ee/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision blocks fallback for subdomain URL",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "https://foo.shopee.vn/product/12345/67890",
    );

    assert.equal(result.allowed, false);
  },
);

test("createShopeePreviewFallbackDecision blocks fallback for empty URL", () => {
  const result = createShopeePreviewFallbackDecision(
    "metadata_incomplete",
    "",
  );

  assert.equal(result.allowed, false);
});

test(
  "createShopeePreviewFallbackDecision blocks fallback for invalid URL format",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_incomplete",
      "not-a-url",
    );

    assert.equal(result.allowed, false);
  },
);

test(
  "createShopeePreviewFallbackDecision normalizes URL in metadata_unavailable case",
  () => {
    const result = createShopeePreviewFallbackDecision(
      "metadata_unavailable",
      "https://shopee.vn/ao-thun-nam-i.99999.88888",
    );

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(
        result.canonicalProductUrl,
        "https://shopee.vn/product/99999/88888",
      );
    }
  },
);