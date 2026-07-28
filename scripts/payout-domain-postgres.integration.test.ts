import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres, { type Sql } from "postgres";

import { validatePhase20mIntegrationSafety } from "./phase20m-integration-safety";

type JsonObject = Record<string, unknown>;

const MONEY_STRING = /^(0|[1-9][0-9]*)$/;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string") {
    const match = /PAYOUT_[A-Z0-9_]+/.exec(message);
    if (match) return match[0];
  }
  if (typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code)) return code;
  return "unknown_failure";
}

async function scenario(
  context: TestContext,
  name: string,
  callback: () => Promise<void>,
): Promise<void> {
  await context.test(name, callback);
}

async function rpc(
  client: SupabaseClient,
  name: string,
  args: JsonObject,
): Promise<JsonObject> {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  assert.ok(result.data && typeof result.data === "object");
  return result.data as JsonObject;
}

async function waitForProfiles(sql: Sql, userIds: readonly string[]): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM public.profiles
      WHERE user_id IN ${sql(userIds)}
    `;
    if (Number(rows[0]?.count ?? 0) === userIds.length) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("phase20m_profile_trigger_timeout");
}

test("Phase 20M.0 payout foundation real-database matrix", async (context) => {
  const safety = validatePhase20mIntegrationSafety();
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    "";
  if (!databaseUrl || !apiUrl || !publishableKey || !serviceKey) {
    throw new Error("phase20m_required_test_environment_missing");
  }

  const admin = postgres(databaseUrl, { max: 1, prepare: false });
  const concurrentA = postgres(databaseUrl, { max: 1, prepare: false });
  const concurrentB = postgres(databaseUrl, { max: 1, prepare: false });
  const service = createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = randomUUID();
  const password = `Vaffiliate-${randomUUID()}-Aa1!`;
  const emails = [
    `phase20m-a-${runId}@example.invalid`,
    `phase20m-b-${runId}@example.invalid`,
  ] as const;
  const userIds: string[] = [];
  const accountIds = [randomUUID(), randomUUID()] as const;
  const conversionIdsA = Array.from({ length: 205 }, () => randomUUID());
  const conversionIdsB = Array.from({ length: 3 }, () => randomUUID());
  const zeroConversionId = randomUUID();
  const pendingConversionId = randomUUID();
  const requestIds = new Set<string>();
  let userA!: SupabaseClient;
  let userB!: SupabaseClient;
  let cleaned = false;

  async function remember(response: JsonObject): Promise<string> {
    const requestId = response.requestId;
    assert.equal(typeof requestId, "string");
    requestIds.add(requestId as string);
    return requestId as string;
  }

  async function cleanup(): Promise<void> {
    if (cleaned) return;
    const exactRequestIds = [...requestIds];
    const itemRows = exactRequestIds.length
      ? await admin<{ id: string }[]>`
          SELECT id FROM public.payout_request_items
          WHERE payout_request_id IN ${admin(exactRequestIds)}
        `
      : [];
    const eventRows = exactRequestIds.length
      ? await admin<{ id: string }[]>`
          SELECT id FROM public.payout_events
          WHERE payout_request_id IN ${admin(exactRequestIds)}
        `
      : [];

    await admin.begin(async (tx) => {
      await tx.unsafe(
        'ALTER TABLE public.payout_requests DISABLE TRIGGER payout_requests_prevent_delete',
      );
      await tx.unsafe(
        'ALTER TABLE public.payout_request_items DISABLE TRIGGER payout_request_items_prevent_delete',
      );
      await tx.unsafe(
        'ALTER TABLE public.payout_events DISABLE TRIGGER payout_events_prevent_mutation',
      );
      if (eventRows.length) {
        await tx`DELETE FROM public.payout_events WHERE id IN ${tx(eventRows.map((row) => row.id))}`;
      }
      if (itemRows.length) {
        await tx`DELETE FROM public.payout_request_items WHERE id IN ${tx(itemRows.map((row) => row.id))}`;
      }
      if (exactRequestIds.length) {
        await tx`DELETE FROM public.payout_requests WHERE id IN ${tx(exactRequestIds)}`;
      }
      const allConversions = [
        ...conversionIdsA,
        ...conversionIdsB,
        zeroConversionId,
        pendingConversionId,
      ];
      await tx`DELETE FROM public.conversions WHERE id IN ${tx(allConversions)}`;
      await tx`DELETE FROM public.payout_accounts WHERE id IN ${tx([...accountIds])}`;
      await tx.unsafe("SET CONSTRAINTS ALL IMMEDIATE");
      await tx.unsafe(
        'ALTER TABLE public.payout_events ENABLE TRIGGER payout_events_prevent_mutation',
      );
      await tx.unsafe(
        'ALTER TABLE public.payout_request_items ENABLE TRIGGER payout_request_items_prevent_delete',
      );
      await tx.unsafe(
        'ALTER TABLE public.payout_requests ENABLE TRIGGER payout_requests_prevent_delete',
      );
    });

    const allConversions = [
      ...conversionIdsA,
      ...conversionIdsB,
      zeroConversionId,
      pendingConversionId,
    ];
    const verifier = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const restoredTriggers = await verifier<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM pg_trigger
        WHERE tgname IN (
          'payout_requests_prevent_delete',
          'payout_request_items_prevent_delete',
          'payout_events_prevent_mutation'
        ) AND tgenabled = 'O'
      `;
      assert.equal(Number(restoredTriggers[0]?.count), 3);

      const residue = await verifier<{
        requests: number;
        items: number;
        events: number;
        conversions: number;
        accounts: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM public.payout_requests WHERE id = ANY(${exactRequestIds}::uuid[])) AS requests,
          (SELECT count(*)::int FROM public.payout_request_items WHERE id = ANY(${itemRows.map((row) => row.id)}::uuid[])) AS items,
          (SELECT count(*)::int FROM public.payout_events WHERE id = ANY(${eventRows.map((row) => row.id)}::uuid[])) AS events,
          (SELECT count(*)::int FROM public.conversions WHERE id = ANY(${allConversions}::uuid[])) AS conversions,
          (SELECT count(*)::int FROM public.payout_accounts WHERE id = ANY(${[...accountIds]}::uuid[])) AS accounts
      `;
      assert.deepEqual(residue[0], {
        requests: 0,
        items: 0,
        events: 0,
        conversions: 0,
        accounts: 0,
      });
    } finally {
      await verifier.end({ timeout: 5 });
    }

    for (const userId of userIds) {
      const existing = await service.auth.admin.getUserById(userId);
      if (!existing.error) {
        const result = await service.auth.admin.deleteUser(userId);
        if (result.error) throw result.error;
      }
      const deleted = await service.auth.admin.getUserById(userId);
      assert.ok(deleted.error);
    }
    cleaned = true;
  }

  try {
    for (const [index, email] of emails.entries()) {
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Phase 20M ${index}` },
      });
      if (created.error || !created.data.user) throw created.error;
      userIds.push(created.data.user.id);
    }
    await waitForProfiles(admin, userIds);

    const makeUserClient = async (email: string): Promise<SupabaseClient> => {
      const client = createClient(apiUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;
      return client;
    };
    userA = await makeUserClient(emails[0]);
    userB = await makeUserClient(emails[1]);

    await admin`
      INSERT INTO public.payout_accounts
        (id, user_id, method, provider, account_name, account_number, status)
      VALUES
        (${accountIds[0]}::uuid, ${userIds[0]}::uuid, 'bank', 'TESTBANK', 'USER A', '1000000001', 'verified'),
        (${accountIds[1]}::uuid, ${userIds[1]}::uuid, 'bank', 'TESTBANK', 'USER B', '1000000002', 'verified')
    `;

    const occurredAt = new Date(Date.now() - 86_400_000);
    const approvedAt = new Date(Date.now() - 43_200_000);
    const payableBase = Date.now() - 21_600_000;
    const conversionRows = [
      ...conversionIdsA.map((id, index) => ({
        id,
        network: "shopee",
        external_order_id: `phase20m-${runId}-a-${index}`,
        publisher_id: userIds[0]!,
        advertiser_id: "phase20m-advertiser",
        campaign_id: "phase20m-campaign",
        offer_id: "phase20m-offer",
        tracking_link_id: `phase20m-tracking-a-${index}`,
        status: "payable",
        order_amount: 10_000 + index,
        network_commission: 1_000 + index * 2,
        cashback_share_bps_snapshot: 5_000,
        user_cashback: 500 + index,
        platform_profit: 500 + index,
        occurred_at: occurredAt,
        approved_at: approvedAt,
        payable_at: new Date(payableBase + index),
        source_conversion_key: sha(`${runId}:a:${index}`),
        validation_status: "approved",
        settlement_status: "payable",
      })),
      ...conversionIdsB.map((id, index) => ({
        id,
        network: "shopee",
        external_order_id: `phase20m-${runId}-b-${index}`,
        publisher_id: userIds[1]!,
        advertiser_id: "phase20m-advertiser",
        campaign_id: "phase20m-campaign",
        offer_id: "phase20m-offer",
        tracking_link_id: `phase20m-tracking-b-${index}`,
        status: "payable",
        order_amount: 20_000 + index,
        network_commission: 2_000 + index * 2,
        cashback_share_bps_snapshot: 5_000,
        user_cashback: 1_000 + index,
        platform_profit: 1_000 + index,
        occurred_at: occurredAt,
        approved_at: approvedAt,
        payable_at: new Date(payableBase + 1_000 + index),
        source_conversion_key: sha(`${runId}:b:${index}`),
        validation_status: "approved",
        settlement_status: "payable",
      })),
    ];
    await admin`
      INSERT INTO public.conversions ${admin(conversionRows,
        "id", "network", "external_order_id", "publisher_id", "advertiser_id",
        "campaign_id", "offer_id", "tracking_link_id", "status", "order_amount",
        "network_commission", "cashback_share_bps_snapshot", "user_cashback",
        "platform_profit", "occurred_at", "approved_at", "payable_at",
        "source_conversion_key", "validation_status", "settlement_status")}
    `;
    await admin`
      INSERT INTO public.conversions (
        id, network, external_order_id, publisher_id, advertiser_id, campaign_id,
        offer_id, tracking_link_id, status, order_amount, network_commission,
        cashback_share_bps_snapshot, user_cashback, platform_profit, occurred_at,
        approved_at, payable_at, source_conversion_key, validation_status,
        settlement_status
      ) VALUES
      (${zeroConversionId}::uuid, 'shopee', ${`phase20m-${runId}-zero`}, ${userIds[0]}::uuid,
       'phase20m-advertiser', 'phase20m-campaign', 'phase20m-offer', 'phase20m-zero',
       'payable', 1000, 0, 5000, 0, 0, ${occurredAt}, ${approvedAt}, ${new Date(payableBase - 2)},
       ${sha(`${runId}:zero`)}, 'approved', 'payable'),
      (${pendingConversionId}::uuid, 'shopee', ${`phase20m-${runId}-pending`}, ${userIds[0]}::uuid,
       'phase20m-advertiser', 'phase20m-campaign', 'phase20m-offer', 'phase20m-pending',
       'pending', 1000, 1000, 5000, 500, 500, ${occurredAt}, NULL, NULL,
       ${sha(`${runId}:pending`)}, 'recorded', 'not_payable')
    `;

    await scenario(context, "03 target guard approved", async () => {
      assert.equal(safety.targetFingerprint, safety.apiFingerprint);
    });
    await scenario(context, "04 payout objects and eight RPCs exist", async () => {
      const rows = await admin<{ tables: number; views: number; functions: number }[]>`
        SELECT
          (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('payout_requests','payout_request_items','payout_events')) AS tables,
          (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND c.relname IN ('payout_requests_owner','payout_request_items_owner','payout_events_owner')) AS views,
          (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_payout_request','cancel_payout_request','approve_payout_request','reject_payout_request','start_payout_processing','mark_payout_review_required','complete_payout_request','confirm_payout_nonpayment')) AS functions
      `;
      assert.deepEqual(rows[0], { tables: 3, views: 3, functions: 8 });
    });
    await scenario(context, "05 eight request states are constrained", async () => {
      const rows = await admin<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'payout_requests_status_check'
      `;
      for (const state of ["requested","approved","processing","review_required","paid","rejected","cancelled","failed"]) assert.match(rows[0]!.definition, new RegExp(state));
    });
    await scenario(context, "06 maximum item count is 200", async () => {
      const rows = await admin<{ definition: string }[]>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='payout_requests_item_count_check'`;
      assert.match(rows[0]!.definition, /200/);
    });
    await scenario(context, "07 provider/reference uniqueness is composite", async () => {
      const rows = await admin<{ name: string; definition: string }[]>`SELECT indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND indexname IN ('payout_requests_provider_processor_reference_unique','payout_requests_provider_payment_reference_unique') ORDER BY indexname`;
      assert.equal(rows.length, 2);
      rows.forEach((row) => assert.match(row.definition, /provider_snapshot/));
    });
    await scenario(context, "08 nonpayment reference exists and is checked", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='nonpayment_reference'`;
      assert.equal(Number(rows[0]?.count), 1);
    });
    await scenario(context, "09 owner views omit sensitive columns", async () => {
      const rows = await admin<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('payout_requests_owner','payout_events_owner')`;
      const names = new Set(rows.map((row) => row.column_name));
      for (const forbidden of ["account_number_snapshot","destination_fingerprint","before_snapshot","after_snapshot","actor_user_id","actor_role","evidence_reference","internal_reason"]) assert.equal(names.has(forbidden), false);
    });
    await scenario(context, "10 owner money projection types are text", async () => {
      const rows = await admin<{ data_type: string }[]>`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests_owner' AND column_name LIKE '%amount_vnd'`;
      assert.ok(rows.length >= 5);
      rows.forEach((row) => assert.equal(row.data_type, "text"));
    });
    await scenario(context, "11 immutability triggers are enabled", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname IN ('payout_requests_prevent_delete','payout_request_items_prevent_delete','payout_events_prevent_mutation') AND tgenabled='O'`;
      assert.equal(Number(rows[0]?.count), 3);
    });
    await scenario(context, "12 deferred consistency triggers are deferrable", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname IN ('payout_requests_deferred_consistency','payout_request_items_deferred_consistency','payout_conversions_deferred_consistency') AND tgdeferrable AND tginitdeferred`;
      assert.equal(Number(rows[0]?.count), 3);
    });

    const createKey1 = randomUUID();
    const request1Response = await rpc(userA, "create_payout_request", {
      p_payout_account_id: accountIds[0],
      p_idempotency_key: createKey1,
    });
    const request1 = await remember(request1Response);
    await scenario(context, "13 authenticated RPC proves database auth.uid ownership", async () => {
      const rows = await admin<{ user_id: string }[]>`SELECT user_id FROM public.payout_requests WHERE id=${request1}::uuid`;
      assert.equal(rows[0]?.user_id, userIds[0]);
    });
    await scenario(context, "14 creation returns decimal-string money", async () => {
      for (const key of ["requestedAmountVnd","reservedAmountVnd","approvedAmountVnd","paidAmountVnd","releasedAmountVnd"]) assert.match(String(request1Response[key]), MONEY_STRING);
    });
    await scenario(context, "15 creation associates exactly 200 conversions", async () => {
      assert.equal(request1Response.itemCount, 200);
    });
    await scenario(context, "16 creation selects only positive money", async () => {
      const rows = await admin<{ minimum: number }[]>`SELECT min(amount)::int AS minimum FROM public.payout_request_items WHERE payout_request_id=${request1}::uuid`;
      assert.ok(Number(rows[0]?.minimum) > 0);
    });
    await scenario(context, "17 zero conversion is excluded", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.payout_request_items WHERE payout_request_id=${request1}::uuid AND conversion_id=${zeroConversionId}::uuid`;
      assert.equal(Number(rows[0]?.count), 0);
    });
    await scenario(context, "18 pending conversion is excluded", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.payout_request_items WHERE payout_request_id=${request1}::uuid AND conversion_id=${pendingConversionId}::uuid`;
      assert.equal(Number(rows[0]?.count), 0);
    });
    await scenario(context, "19 deterministic oldest 200 are selected", async () => {
      const rows = await admin<{ conversion_id: string }[]>`SELECT conversion_id FROM public.payout_request_items WHERE payout_request_id=${request1}::uuid ORDER BY conversion_payable_at_snapshot, conversion_id`;
      assert.deepEqual(new Set(rows.map((row) => row.conversion_id)), new Set(conversionIdsA.slice(0, 200)));
    });
    await scenario(context, "20 unreleased uniqueness has no duplicate", async () => {
      const rows = await admin<{ count: number; distinct_count: number }[]>`SELECT count(*)::int AS count, count(DISTINCT conversion_id)::int AS distinct_count FROM public.payout_request_items WHERE payout_request_id=${request1}::uuid AND released_at IS NULL`;
      assert.equal(rows[0]?.count, rows[0]?.distinct_count);
    });
    await scenario(context, "21 create idempotent replay returns original", async () => {
      const replay = await rpc(userA, "create_payout_request", { p_payout_account_id: accountIds[0], p_idempotency_key: createKey1 });
      assert.equal(replay.requestId, request1);
      assert.equal(replay.replayed, true);
      assert.equal(replay.status, "requested");
    });
    await scenario(context, "22 create key conflict is rejected", async () => {
      const result = await userA.rpc("create_payout_request", { p_payout_account_id: accountIds[1], p_idempotency_key: createKey1 });
      assert.equal(safeFailure(result.error), "PAYOUT_IDEMPOTENCY_KEY_CONFLICT");
    });
    await scenario(context, "23 user B cannot cancel user A request", async () => {
      const result = await userB.rpc("cancel_payout_request", { p_payout_request_id: request1, p_idempotency_key: randomUUID() });
      assert.equal(safeFailure(result.error), "PAYOUT_REQUEST_NOT_OWNED");
    });
    await scenario(context, "24 user A reads own safe projection", async () => {
      const result = await userA.from("payout_requests_owner").select("*").eq("id", request1).single();
      assert.ifError(result.error);
      assert.equal(result.data?.status, "requested");
      assert.equal("destination_fingerprint" in (result.data ?? {}), false);
    });
    await scenario(context, "25 user B cannot read user A projection", async () => {
      const result = await userB.from("payout_requests_owner").select("id").eq("id", request1);
      assert.ifError(result.error);
      assert.equal(result.data?.length, 0);
    });
    await scenario(context, "26 authenticated base-table SELECT is denied", async () => {
      const result = await userA.from("payout_requests").select("id").eq("id", request1);
      assert.ok(result.error);
    });
    await scenario(context, "27 owner event view exposes no internal evidence", async () => {
      const result = await userA.from("payout_events_owner").select("*").eq("payout_request_id", request1).single();
      assert.ifError(result.error);
      for (const key of ["actor_user_id","actor_role","before_snapshot","after_snapshot","evidence_reference","internal_reason"]) assert.equal(key in (result.data ?? {}), false);
    });
    await scenario(context, "28 owner cancellation releases all items", async () => {
      const cancelled = await rpc(userA, "cancel_payout_request", { p_payout_request_id: request1, p_idempotency_key: randomUUID() });
      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.ownerReasonCode, "user_cancelled");
    });
    await scenario(context, "29 cancellation leaves conversions payable", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.conversions WHERE id IN ${admin(conversionIdsA.slice(0, 200))} AND status='payable'`;
      assert.equal(Number(rows[0]?.count), 200);
    });
    await scenario(context, "30 released items are reusable", async () => {
      const response = await rpc(userA, "create_payout_request", { p_payout_account_id: accountIds[0], p_idempotency_key: randomUUID() });
      const id = await remember(response);
      assert.equal(response.itemCount, 200);
      requestIds.add(id);
    });

    const request2 = [...requestIds].at(-1)!;
    await admin`UPDATE public.payout_accounts SET provider='CHANGEDBANK', status='disabled' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "31 approval requires verified current account", async () => {
      const result = await service.rpc("approve_payout_request", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_actor_user_id: randomUUID(), p_actor_role: "admin" });
      assert.equal(safeFailure(result.error), "PAYOUT_ACCOUNT_NOT_VERIFIED");
    });
    await admin`UPDATE public.payout_accounts SET status='verified' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "32 approval rejects destination fingerprint drift", async () => {
      const result = await service.rpc("approve_payout_request", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_actor_user_id: randomUUID(), p_actor_role: "admin" });
      assert.equal(safeFailure(result.error), "PAYOUT_DESTINATION_CHANGED");
    });
    await admin`UPDATE public.payout_accounts SET provider='TESTBANK' WHERE id=${accountIds[0]}::uuid`;
    await admin`UPDATE public.payout_accounts SET status='verified' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "33 admin approval succeeds with matching destination", async () => {
      const response = await rpc(service, "approve_payout_request", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_actor_user_id: randomUUID(), p_actor_role: "admin" });
      assert.equal(response.status, "approved");
    });
    await admin`UPDATE public.payout_accounts SET account_name='CHANGED USER' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "34 start processing revalidates current destination", async () => {
      const result = await service.rpc("start_payout_processing", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_processor_reference: `processor-${runId}-1` });
      assert.ok(["PAYOUT_ACCOUNT_NOT_VERIFIED", "PAYOUT_DESTINATION_CHANGED"].includes(safeFailure(result.error)));
    });
    await admin`UPDATE public.payout_accounts SET account_name='USER A' WHERE id=${accountIds[0]}::uuid`;
    await admin`UPDATE public.payout_accounts SET status='verified' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "35 start processing succeeds with matching verified account", async () => {
      const response = await rpc(service, "start_payout_processing", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_processor_reference: `processor-${runId}-1` });
      assert.equal(response.status, "processing");
    });
    await admin`UPDATE public.payout_accounts SET status='disabled' WHERE id=${accountIds[0]}::uuid`;
    await scenario(context, "36 uncertain outcome does not recheck mutable account", async () => {
      const response = await rpc(service, "mark_payout_review_required", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_uncertainty_code: "processor_timeout", p_outcome_reference: `outcome-${runId}-1` });
      assert.equal(response.status, "review_required");
      assert.equal(response.ownerReasonCode, "payment_under_review");
    });
    await scenario(context, "37 review-required retains associations", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.payout_request_items WHERE payout_request_id=${request2}::uuid AND released_at IS NULL AND paid_at IS NULL`;
      assert.equal(Number(rows[0]?.count), 200);
    });
    await scenario(context, "38 confirmed payment resolves review-required", async () => {
      const response = await rpc(service, "complete_payout_request", { p_payout_request_id: request2, p_idempotency_key: randomUUID(), p_payment_reference: `payment-${runId}-1` });
      assert.equal(response.status, "paid");
      assert.match(String(response.paidAmountVnd), MONEY_STRING);
    });
    await scenario(context, "39 paid request marks all conversions paid", async () => {
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.conversions c JOIN public.payout_request_items i ON i.conversion_id=c.id WHERE i.payout_request_id=${request2}::uuid AND c.status='paid' AND c.paid_at=i.paid_at`;
      assert.equal(Number(rows[0]?.count), 200);
    });
    await scenario(context, "40 post-processing account changes do not alter snapshot", async () => {
      const rows = await admin<{ provider_snapshot: string }[]>`SELECT provider_snapshot FROM public.payout_requests WHERE id=${request2}::uuid`;
      assert.equal(rows[0]?.provider_snapshot, "TESTBANK");
    });

    await admin`UPDATE public.payout_accounts SET status='verified' WHERE id=${accountIds[0]}::uuid`;
    const request3Response = await rpc(userA, "create_payout_request", { p_payout_account_id: accountIds[0], p_idempotency_key: randomUUID() });
    const request3 = await remember(request3Response);
    await scenario(context, "41 remaining five conversions create a bounded request", async () => {
      assert.equal(request3Response.itemCount, 5);
    });
    await rpc(service, "approve_payout_request", { p_payout_request_id: request3, p_idempotency_key: randomUUID(), p_actor_user_id: randomUUID(), p_actor_role: "super_admin" });
    await rpc(service, "start_payout_processing", { p_payout_request_id: request3, p_idempotency_key: randomUUID(), p_processor_reference: `processor-${runId}-2` });
    await scenario(context, "42 evidence reference rejects control characters", async () => {
      const result = await service.rpc("mark_payout_review_required", { p_payout_request_id: request3, p_idempotency_key: randomUUID(), p_uncertainty_code: "timeout", p_outcome_reference: "bad\nreference" });
      assert.equal(safeFailure(result.error), "PAYOUT_EVIDENCE_REFERENCE_INVALID");
    });
    await scenario(context, "43 nonpayment reference rejects control characters", async () => {
      const result = await service.rpc("confirm_payout_nonpayment", { p_payout_request_id: request3, p_idempotency_key: randomUUID(), p_nonpayment_reference: "bad\tref", p_reason_code: "confirmed_not_paid", p_reason: "Provider confirmed no payment." });
      assert.equal(safeFailure(result.error), "PAYOUT_EVIDENCE_REFERENCE_INVALID");
    });
    await scenario(context, "44 confirmed nonpayment is required for failed", async () => {
      const response = await rpc(service, "confirm_payout_nonpayment", { p_payout_request_id: request3, p_idempotency_key: randomUUID(), p_nonpayment_reference: `nonpayment-${runId}-1`, p_reason_code: "confirmed_not_paid", p_reason: "Provider confirmed no payment." });
      assert.equal(response.status, "failed");
      assert.equal(response.ownerReasonCode, "payment_not_completed");
    });
    await scenario(context, "45 failed request releases without paying conversions", async () => {
      const rows = await admin<{ released: number; payable: number }[]>`
        SELECT
          count(*) FILTER (WHERE i.released_at IS NOT NULL AND i.paid_at IS NULL)::int AS released,
          count(*) FILTER (WHERE c.status='payable')::int AS payable
        FROM public.payout_request_items i JOIN public.conversions c ON c.id=i.conversion_id
        WHERE i.payout_request_id=${request3}::uuid
      `;
      assert.deepEqual(rows[0], { released: 5, payable: 5 });
    });
    await scenario(context, "46 owner failed projection hides nonpayment evidence", async () => {
      const result = await userA.from("payout_requests_owner").select("*").eq("id", request3).single();
      assert.ifError(result.error);
      assert.equal(result.data?.owner_reason_code, "payment_not_completed");
      assert.equal("nonpayment_reference" in (result.data ?? {}), false);
    });

    let concurrentRequest: string | undefined;
    await scenario(context, "47 concurrent create uses independent PostgreSQL connections safely", async () => {
      const createThroughAuthenticatedRole = async (sql: Sql): Promise<JsonObject> =>
        sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE authenticated");
          await tx`SELECT set_config('request.jwt.claim.sub', ${userIds[0]!}, true)`;
          const rows = await tx<{ response: JsonObject }[]>`
            SELECT public.create_payout_request(
              ${accountIds[0]}::uuid,
              ${randomUUID()}::uuid
            ) AS response
          `;
          return rows[0]!.response;
        });
      const outcomes = await Promise.allSettled([
        createThroughAuthenticatedRole(concurrentA),
        createThroughAuthenticatedRole(concurrentB),
      ]);
      const successes = outcomes.filter(
        (entry): entry is PromiseFulfilledResult<JsonObject> => entry.status === "fulfilled",
      );
      const failures = outcomes.filter(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);
      assert.equal(safeFailure(failures[0]!.reason), "PAYOUT_NO_WITHDRAWABLE_CONVERSIONS");
      concurrentRequest = await remember(successes[0]!.value);
    });
    await scenario(context, "48 concurrent admin transitions serialize on request lock", async () => {
      assert.ok(concurrentRequest);
      const actorA = randomUUID();
      const actorB = randomUUID();
      const before = await admin<{
        status: string;
        version: number;
        approved_events: number;
      }[]>`
        SELECT status, version,
          (SELECT count(*)::int FROM public.payout_events
           WHERE payout_request_id = ${concurrentRequest}::uuid
             AND event_type = 'request_approved') AS approved_events
        FROM public.payout_requests
        WHERE id = ${concurrentRequest}::uuid
      `;
      assert.equal(before[0]?.status, "requested");

      const outcomes = await Promise.allSettled([
        concurrentA`SELECT public.approve_payout_request(${concurrentRequest}::uuid, ${randomUUID()}::uuid, ${actorA}::uuid, 'admin')`,
        concurrentB`SELECT public.approve_payout_request(${concurrentRequest}::uuid, ${randomUUID()}::uuid, ${actorB}::uuid, 'admin')`,
      ]);
      const successes = outcomes.filter((entry) => entry.status === "fulfilled");
      const failures = outcomes.filter(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);
      assert.equal(safeFailure(failures[0]!.reason), "PAYOUT_INVALID_TRANSITION");

      const after = await admin<{
        status: string;
        version: number;
        approved_events: number;
      }[]>`
        SELECT status, version,
          (SELECT count(*)::int FROM public.payout_events
           WHERE payout_request_id = ${concurrentRequest}::uuid
             AND event_type = 'request_approved') AS approved_events
        FROM public.payout_requests
        WHERE id = ${concurrentRequest}::uuid
      `;
      assert.equal(after[0]?.status, "approved");
      assert.equal(Number(after[0]?.version), Number(before[0]?.version) + 1);
      assert.equal(
        Number(after[0]?.approved_events),
        Number(before[0]?.approved_events) + 1,
      );
    });
    await scenario(context, "49 audit rows reject update and delete", async () => {
      const event = await admin<{ id: string }[]>`SELECT id FROM public.payout_events WHERE payout_request_id=${request1}::uuid ORDER BY sequence_no LIMIT 1`;
      await assert.rejects(admin`UPDATE public.payout_events SET internal_reason='mutated' WHERE id=${event[0]!.id}::uuid`);
      await assert.rejects(admin`DELETE FROM public.payout_events WHERE id=${event[0]!.id}::uuid`);
    });
    await scenario(context, "50 deferred cross-table mismatch rolls back", async () => {
      const userBRequest = await remember(
        await rpc(userB, "create_payout_request", {
          p_payout_account_id: accountIds[1],
          p_idempotency_key: randomUUID(),
        }),
      );
      const item = await admin<{ conversion_id: string }[]>`
        SELECT conversion_id
        FROM public.payout_request_items
        WHERE payout_request_id=${userBRequest}::uuid
        LIMIT 1
      `;
      await assert.rejects(
        admin.begin(async (tx) => {
          await tx`
            UPDATE public.conversions
            SET user_cashback = user_cashback + 1,
                platform_profit = platform_profit - 1
            WHERE id=${item[0]!.conversion_id}::uuid
          `;
        }),
      );
    });
    await scenario(context, "51 transition idempotency scope includes actor operation and request", async () => {
      const rows = await admin<{ idempotency_scope: string }[]>`
        SELECT idempotency_scope
        FROM public.payout_events
        WHERE payout_request_id=${request2}::uuid
          AND event_type <> 'request_created'
      `;
      rows.forEach((row) => {
        assert.match(row.idempotency_scope, new RegExp(request2));
        assert.match(row.idempotency_scope, /:(approve|start_processing|review_required|complete):/);
      });
    });
    await scenario(context, "52 exact cleanup removes rows and Admin API removes Auth users", async () => {
      await cleanup();
      const triggers = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname IN ('payout_requests_prevent_delete','payout_request_items_prevent_delete','payout_events_prevent_mutation') AND tgenabled='O'`;
      assert.equal(Number(triggers[0]?.count), 3);
      const rows = await admin<{ count: number }[]>`SELECT count(*)::int AS count FROM public.payout_requests WHERE id IN ${admin([...requestIds])}`;
      assert.equal(Number(rows[0]?.count), 0);
      for (const userId of userIds) {
        const lookup = await service.auth.admin.getUserById(userId);
        assert.ok(lookup.error);
      }
    });
  } finally {
    try {
      await cleanup();
    } finally {
      await Promise.allSettled([
        userA?.auth.signOut(),
        userB?.auth.signOut(),
      ]);
      await Promise.all([
        admin.end({ timeout: 5 }),
        concurrentA.end({ timeout: 5 }),
        concurrentB.end({ timeout: 5 }),
      ]);
    }
  }
});
