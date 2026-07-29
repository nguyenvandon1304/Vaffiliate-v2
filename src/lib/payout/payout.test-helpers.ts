export const TEST_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_CONVERSION_ID = "33333333-3333-4333-8333-333333333333";
export const TEST_EVENT_ID = "44444444-4444-4444-8444-444444444444";
export const TEST_IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
export const TEST_ACTOR_ID = "66666666-6666-4666-8666-666666666666";
export const TEST_NOW = "2026-07-28T08:00:00.000Z";

export function payoutRequestViewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REQUEST_ID,
    status: "requested",
    currency: "VND",
    requested_amount_vnd: "90071992547409931234567890",
    reserved_amount_vnd: "90071992547409931234567890",
    approved_amount_vnd: "0",
    paid_amount_vnd: "0",
    released_amount_vnd: "0",
    item_count: 1,
    payout_method_snapshot: "bank",
    provider_snapshot: "TESTBANK",
    account_name_snapshot: "TEST OWNER",
    account_number_masked: "1234",
    owner_reason_code: null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
    approved_at: null,
    processing_at: null,
    review_required_at: null,
    paid_at: null,
    rejected_at: null,
    cancelled_at: null,
    failed_at: null,
    ...overrides,
  };
}

export function payoutItemViewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    payout_request_id: TEST_REQUEST_ID,
    conversion_id: TEST_CONVERSION_ID,
    amount_vnd: "90071992547409931234567890",
    currency: "VND",
    conversion_status_snapshot: "payable",
    reserved_at: TEST_NOW,
    released_at: null,
    paid_at: null,
    created_at: TEST_NOW,
    ...overrides,
  };
}

export function payoutEventViewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_EVENT_ID,
    payout_request_id: TEST_REQUEST_ID,
    sequence_no: 1,
    event_type: "request_created",
    previous_status: null,
    next_status: "requested",
    requested_amount_vnd: "90071992547409931234567890",
    reserved_amount_vnd: "90071992547409931234567890",
    approved_amount_vnd: "0",
    paid_amount_vnd: "0",
    released_amount_vnd: "0",
    owner_reason_code: null,
    created_at: TEST_NOW,
    ...overrides,
  };
}

export function payoutRpcResponse(overrides: Record<string, unknown> = {}) {
  return {
    requestId: TEST_REQUEST_ID,
    status: "requested",
    currency: "VND",
    requestedAmountVnd: "90071992547409931234567890",
    reservedAmountVnd: "90071992547409931234567890",
    approvedAmountVnd: "0",
    paidAmountVnd: "0",
    releasedAmountVnd: "0",
    itemCount: 1,
    payoutAccount: {
      method: "bank",
      provider: "TESTBANK",
      accountName: "TEST OWNER",
      accountNumberMasked: "1234",
    },
    ownerReasonCode: null,
    eventId: TEST_EVENT_ID,
    eventCreatedAt: TEST_NOW,
    requestCreatedAt: TEST_NOW,
    replayed: false,
    ...overrides,
  };
}
