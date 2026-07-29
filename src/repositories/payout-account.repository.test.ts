import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PayoutApplicationError } from "@/lib/payout/errors";
import { TEST_ACCOUNT_ID } from "@/lib/payout/payout.test-helpers";

import { listVerifiedPayoutAccountsWithClientAsync } from "./payout-account.repository";

interface QueryCall {
  readonly relation: string;
  readonly columns: string;
  readonly filters: ReadonlyArray<readonly [string, unknown]>;
}

function payoutAccountClient(input: {
  readonly rows?: readonly Record<string, unknown>[];
  readonly error?: unknown;
  readonly calls: QueryCall[];
}): SupabaseClient {
  return {
    from(relation: string) {
      let columns = "";
      const filters: Array<readonly [string, unknown]> = [];
      const builder = {
        select(value: string) {
          columns = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          input.calls.push({ relation, columns, filters: [...filters] });
          const statusFilter = filters.find(([column]) => column === "status")?.[1];
          const rows = (input.rows ?? []).filter(
            (row) => statusFilter === undefined || row.status === statusFilter,
          );
          return Promise.resolve({ data: rows, error: input.error ?? null }).then(
            onfulfilled,
            onrejected,
          );
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const VERIFIED_ROW = {
  id: TEST_ACCOUNT_ID,
  method: "bank",
  provider: "TESTBANK",
  account_number: "1".repeat(12) + "3456",
  status: "verified",
};

test("payout-account repository uses owner RLS and verified-only filtering", async () => {
  const calls: QueryCall[] = [];
  const options = await listVerifiedPayoutAccountsWithClientAsync(
    payoutAccountClient({
      calls,
      rows: [
        VERIFIED_ROW,
        { ...VERIFIED_ROW, id: "77777777-7777-4777-8777-777777777777", status: "unverified" },
        { ...VERIFIED_ROW, id: "88888888-8888-4888-8888-888888888888", status: "disabled" },
        { ...VERIFIED_ROW, id: "99999999-9999-4999-8999-999999999999", status: "rejected" },
      ],
    }),
  );

  assert.equal(options.length, 1);
  assert.deepEqual(calls, [
    {
      relation: "payout_accounts",
      columns: "id,method,provider,account_number,status",
      filters: [["status", "verified"]],
    },
  ]);
  assert.equal(calls[0]!.filters.some(([column]) => column === "user_id"), false);
});

test("payout-account repository returns only masked public data", async () => {
  const options = await listVerifiedPayoutAccountsWithClientAsync(
    payoutAccountClient({ calls: [], rows: [VERIFIED_ROW] }),
  );
  const serialized = JSON.stringify(options);

  assert.deepEqual(options, [
    {
      payoutAccountId: TEST_ACCOUNT_ID,
      method: "bank",
      providerLabel: "TESTBANK",
      maskedDestination: "****3456",
      verification: "verified",
    },
  ]);
  assert.equal(serialized.includes(VERIFIED_ROW.account_number), false);
  assert.equal(serialized.includes("account_number"), false);
});

test("payout-account repository sanitizes Supabase errors", async () => {
  await assert.rejects(
    listVerifiedPayoutAccountsWithClientAsync(
      payoutAccountClient({
        calls: [],
        error: {
          message: "relation payout_accounts leaked raw database detail",
          details: `account_number=${VERIFIED_ROW.account_number}`,
        },
      }),
    ),
    (error) =>
      error instanceof PayoutApplicationError &&
      error.code === "PAYOUT_UNEXPECTED_ERROR" &&
      error.message === "PAYOUT_UNEXPECTED_ERROR",
  );
});

test("payout-account repository fails safely on malformed rows", async () => {
  await assert.rejects(
    listVerifiedPayoutAccountsWithClientAsync(
      payoutAccountClient({
        calls: [],
        rows: [{ ...VERIFIED_ROW, id: "not-a-uuid" }],
      }),
    ),
    (error) =>
      error instanceof PayoutApplicationError &&
      error.code === "PAYOUT_RESPONSE_INVALID",
  );
});
