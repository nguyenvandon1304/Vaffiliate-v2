import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";
const EXPECTED_HOST = IS_GITHUB_ACTIONS
  ? "127.0.0.1"
  : "aws-0-ap-southeast-1.pooler.supabase.com";
const EXPECTED_PORT = "5432";
const EXPECTED_DATABASE = "postgres";
const EXPECTED_URL_USERNAME = IS_GITHUB_ACTIONS
  ? "postgres"
  : "postgres.ujjcwncejnxnawpnijbi";

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for PostgreSQL integration tests",
  );
}

const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.protocol === "postgres:" ||
    parsedDatabaseUrl.protocol === "postgresql:",
  "DATABASE_URL must use PostgreSQL",
);

const parsedHostname = parsedDatabaseUrl.hostname.toLowerCase();

if (IS_GITHUB_ACTIONS) {
  assert.ok(
    parsedHostname === "127.0.0.1" ||
      parsedHostname === "localhost" ||
      parsedHostname === "::1",
    `GitHub Actions must use loopback PostgreSQL, received ${parsedHostname}`,
  );
} else {
  assert.equal(parsedHostname, EXPECTED_HOST);
}

assert.equal(parsedDatabaseUrl.port, EXPECTED_PORT);
assert.equal(
  decodeURIComponent(parsedDatabaseUrl.pathname),
  `/${EXPECTED_DATABASE}`,
);
assert.equal(
  decodeURIComponent(parsedDatabaseUrl.username),
  EXPECTED_URL_USERNAME,
);

const PUBLISHER_ID = randomUUID();
const RUN_ID = randomUUID();

interface ConstraintCase {
  readonly name: string;
  readonly expectedConstraint: string;
  readonly execute: (
    tx: postgres.TransactionSql<Record<string, never>>,
  ) => Promise<unknown>;
}

interface PositiveCase {
  readonly name: string;
  readonly execute: (
    tx: postgres.TransactionSql<Record<string, never>>,
  ) => Promise<unknown>;
}

function assertCheckViolation(
  error: unknown,
  expectedConstraint: string,
): boolean {
  assert.ok(error && typeof error === "object");
  const postgresError = error as {
    readonly code?: string;
    readonly constraint_name?: string;
  };
  assert.equal(postgresError.code, "23514");
  assert.equal(postgresError.constraint_name, expectedConstraint);
  return true;
}

async function runConstraintCase(
  tx: postgres.TransactionSql<Record<string, never>>,
  constraintCase: ConstraintCase,
): Promise<void> {
  await assert.rejects(
    tx.savepoint(constraintCase.name, async (savepoint) => {
      await constraintCase.execute(savepoint);
    }),
    (error) =>
      assertCheckViolation(error, constraintCase.expectedConstraint),
  );
}

async function runPositiveCase(
  tx: postgres.TransactionSql<Record<string, never>>,
  positiveCase: PositiveCase,
): Promise<void> {
  await tx.savepoint(positiveCase.name, async (savepoint) => {
    await positiveCase.execute(savepoint);
  });
  console.log(`POSITIVE_BPS_CASE=${positiveCase.name}:PASS`);
}

test("Phase 20K policy snapshot constraints isolate BPS range and allocation failures", async () => {
  const sql = postgres(DATABASE_URL, {
    max: 1,
    prepare: false,
    fetch_types: false,
  });

  try {
    const [identity] = await sql<
      { database_name: string; database_user: string; connectivity: number }[]
    >`
      SELECT
        current_database()::text AS database_name,
        current_user::text AS database_user,
        1::int AS connectivity
    `;
    assert.equal(identity?.database_name, EXPECTED_DATABASE);
    assert.equal(identity?.database_user, "postgres");
    assert.equal(identity?.connectivity, 1);
    console.log(
      `DATABASE_GUARD_POLICY_MATRIX=PASS host=${EXPECTED_HOST} port=${EXPECTED_PORT} database=${EXPECTED_DATABASE} username=${EXPECTED_URL_USERNAME} current_user=postgres connectivity=1`,
    );

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO auth.users (id, raw_user_meta_data)
        VALUES (${PUBLISHER_ID}, '{}'::jsonb)
      `;
      await tx`
        INSERT INTO public.reconciliation_runs (
          id,
          network,
          created_by_user_id,
          created_by_role,
          policy_version,
          candidate_fingerprint
        )
        VALUES (
          ${RUN_ID},
          'shopee',
          ${PUBLISHER_ID},
          'admin',
          1,
          'phase20k-policy-constraint-fixture'
        )
      `;

      // Control rows prove every non-target field in the fixtures is valid.
      await tx`
        INSERT INTO public.conversions (
          external_order_id,
          publisher_id,
          advertiser_id,
          campaign_id,
          offer_id,
          tracking_link_id,
          network,
          status,
          order_amount,
          network_commission,
          user_cashback,
          platform_profit,
          cashback_share_bps_snapshot,
          occurred_at
        )
        VALUES (
          'phase20k-control-conversion',
          ${PUBLISHER_ID},
          'phase20k-advertiser',
          'phase20k-campaign',
          'phase20k-offer',
          'phase20k-link',
          'shopee',
          'pending',
          1000,
          1000,
          600,
          400,
          6000,
          now()
        )
      `;
      await tx`
        INSERT INTO public.reconciliation_audit_events (
          network,
          source_conversion_key,
          idempotency_key,
          conversion_id,
          previous_status,
          next_status,
          decision,
          reason_code,
          human_reason,
          network_commission,
          user_cashback,
          platform_profit,
          cashback_share_bps_snapshot,
          actor_kind,
          reconciliation_run_id
        )
        VALUES (
          'shopee',
          repeat('a', 64),
          repeat('b', 64),
          '20000000-0000-4000-8000-000000000010',
          'pending',
          'approved',
          'approve',
          'phase20k_control',
          'Phase 20K control audit row',
          1000,
          600,
          400,
          6000,
          'system',
          ${RUN_ID}
        )
      `;
      await tx`
        INSERT INTO public.reconciliation_run_candidates (
          id,
          run_id,
          conversion_id,
          source_conversion_key,
          network,
          expected_previous_status,
          intended_next_status,
          planned_reason_code,
          planned_money_network_commission,
          planned_money_user_cashback,
          planned_money_platform_profit,
          planned_cashback_share_bps,
          planned_idempotency_key,
          provenance_fingerprint
        )
        VALUES (
          '20000000-0000-4000-8000-000000000020',
          ${RUN_ID},
          '20000000-0000-4000-8000-000000000021',
          repeat('c', 64),
          'shopee',
          'pending',
          'approved',
          'phase20k_control',
          1000,
          600,
          400,
          6000,
          repeat('d', 64),
          'phase20k-control-provenance'
        )
      `;

      const positiveCases: readonly PositiveCase[] = [
        ...([null, 0, 10000] as const).map((bps) => {
          const userCashback = bps === null ? 500 : bps === 0 ? 0 : 1000;
          const platformProfit = 1000 - userCashback;
          const label = bps === null ? "null" : String(bps);
          return {
            name: `positive_conversions_${label}`,
            execute: (savepoint) => savepoint`
              INSERT INTO public.conversions (
                external_order_id, publisher_id, advertiser_id, campaign_id,
                offer_id, tracking_link_id, network, status, order_amount,
                network_commission, user_cashback, platform_profit,
                cashback_share_bps_snapshot, occurred_at
              )
              VALUES (
                ${`phase20k-positive-conversion-${label}`}, ${PUBLISHER_ID},
                'phase20k-advertiser', 'phase20k-campaign', 'phase20k-offer',
                'phase20k-link', 'shopee', 'pending', 1000, 1000,
                ${userCashback}, ${platformProfit}, ${bps}, now()
              )
            `,
          } satisfies PositiveCase;
        }),
        ...([null, 0, 10000] as const).map((bps, index) => {
          const userCashback = bps === null ? 500 : bps === 0 ? 0 : 1000;
          const platformProfit = 1000 - userCashback;
          const label = bps === null ? "null" : String(bps);
          return {
            name: `positive_audit_${label}`,
            execute: (savepoint) => savepoint`
              INSERT INTO public.reconciliation_audit_events (
                network, source_conversion_key, idempotency_key, conversion_id,
                previous_status, next_status, decision, reason_code, human_reason,
                network_commission, user_cashback, platform_profit,
                cashback_share_bps_snapshot, actor_kind, reconciliation_run_id
              )
              VALUES (
                'shopee', ${String(index + 3).repeat(64)},
                ${String(index + 6).repeat(64)},
                ${`21000000-0000-4000-8000-00000000000${index}`},
                'pending', 'approved', 'approve', 'phase20k_positive',
                'Phase 20K positive audit row', 1000, ${userCashback},
                ${platformProfit}, ${bps}, 'system', ${RUN_ID}
              )
            `,
          } satisfies PositiveCase;
        }),
        ...([null, 0, 10000] as const).map((bps, index) => {
          const userCashback = bps === null ? 500 : bps === 0 ? 0 : 1000;
          const platformProfit = 1000 - userCashback;
          const label = bps === null ? "null" : String(bps);
          return {
            name: `positive_candidates_${label}`,
            execute: (savepoint) => savepoint`
              INSERT INTO public.reconciliation_run_candidates (
                id, run_id, conversion_id, source_conversion_key, network,
                expected_previous_status, intended_next_status,
                planned_reason_code, planned_money_network_commission,
                planned_money_user_cashback, planned_money_platform_profit,
                planned_cashback_share_bps, planned_idempotency_key,
                provenance_fingerprint
              )
              VALUES (
                ${`22000000-0000-4000-8000-00000000000${index}`}, ${RUN_ID},
                ${`23000000-0000-4000-8000-00000000000${index}`},
                ${String(index + 6).repeat(64)}, 'shopee', 'pending', 'approved',
                'phase20k_positive', 1000, ${userCashback}, ${platformProfit},
                ${bps}, ${String(index + 3).repeat(64)},
                ${`phase20k-positive-candidate-${label}`}
              )
            `,
          } satisfies PositiveCase;
        }),
      ];

      for (const positiveCase of positiveCases) {
        await runPositiveCase(tx, positiveCase);
      }
      assert.equal(positiveCases.length, 9);
      console.log("POSITIVE_BPS_BOUNDARY_MATRIX=PASS case_count=9");

      const cases: readonly ConstraintCase[] = [
        {
          name: "conversion_bps_below_range",
          expectedConstraint:
            "conversions_cashback_share_bps_snapshot_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.conversions (
              external_order_id, publisher_id, advertiser_id, campaign_id,
              offer_id, tracking_link_id, network, status, order_amount,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, occurred_at
            )
            VALUES (
              'phase20k-conversion-bps-low', ${PUBLISHER_ID},
              'phase20k-advertiser', 'phase20k-campaign', 'phase20k-offer',
              'phase20k-link', 'shopee', 'pending', 0, 0, 0, 0, -1, now()
            )
          `,
        },
        {
          name: "conversion_bps_above_range",
          expectedConstraint:
            "conversions_cashback_share_bps_snapshot_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.conversions (
              external_order_id, publisher_id, advertiser_id, campaign_id,
              offer_id, tracking_link_id, network, status, order_amount,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, occurred_at
            )
            VALUES (
              'phase20k-conversion-bps-high', ${PUBLISHER_ID},
              'phase20k-advertiser', 'phase20k-campaign', 'phase20k-offer',
              'phase20k-link', 'shopee', 'pending', 0, 0, 0, 0, 10001, now()
            )
          `,
        },
        {
          name: "audit_bps_below_range",
          expectedConstraint:
            "reconciliation_audit_events_cashback_bps_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_audit_events (
              network, source_conversion_key, idempotency_key, conversion_id,
              previous_status, next_status, decision, reason_code, human_reason,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, actor_kind, reconciliation_run_id
            )
            VALUES (
              'shopee', repeat('e', 64), repeat('f', 64),
              '20000000-0000-4000-8000-000000000030', 'pending', 'approved',
              'approve', 'phase20k_bps_low', 'Phase 20K BPS low audit row',
              0, 0, 0, -1, 'system', ${RUN_ID}
            )
          `,
        },
        {
          name: "audit_bps_above_range",
          expectedConstraint:
            "reconciliation_audit_events_cashback_bps_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_audit_events (
              network, source_conversion_key, idempotency_key, conversion_id,
              previous_status, next_status, decision, reason_code, human_reason,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, actor_kind, reconciliation_run_id
            )
            VALUES (
              'shopee', repeat('1', 64), repeat('2', 64),
              '20000000-0000-4000-8000-000000000031', 'pending', 'approved',
              'approve', 'phase20k_bps_high', 'Phase 20K BPS high audit row',
              0, 0, 0, 10001, 'system', ${RUN_ID}
            )
          `,
        },
        {
          name: "candidate_bps_below_range",
          expectedConstraint:
            "reconciliation_run_candidates_cashback_bps_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_run_candidates (
              id, run_id, conversion_id, source_conversion_key, network,
              expected_previous_status, intended_next_status,
              planned_reason_code, planned_money_network_commission,
              planned_money_user_cashback, planned_money_platform_profit,
              planned_cashback_share_bps, planned_idempotency_key,
              provenance_fingerprint
            )
            VALUES (
              '20000000-0000-4000-8000-000000000040', ${RUN_ID},
              '20000000-0000-4000-8000-000000000041', repeat('3', 64),
              'shopee', 'pending', 'approved', 'phase20k_bps_low',
              0, 0, 0, -1, repeat('4', 64), 'phase20k-bps-low-provenance'
            )
          `,
        },
        {
          name: "candidate_bps_above_range",
          expectedConstraint:
            "reconciliation_run_candidates_cashback_bps_range_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_run_candidates (
              id, run_id, conversion_id, source_conversion_key, network,
              expected_previous_status, intended_next_status,
              planned_reason_code, planned_money_network_commission,
              planned_money_user_cashback, planned_money_platform_profit,
              planned_cashback_share_bps, planned_idempotency_key,
              provenance_fingerprint
            )
            VALUES (
              '20000000-0000-4000-8000-000000000042', ${RUN_ID},
              '20000000-0000-4000-8000-000000000043', repeat('5', 64),
              'shopee', 'pending', 'approved', 'phase20k_bps_high',
              0, 0, 0, 10001, repeat('6', 64), 'phase20k-bps-high-provenance'
            )
          `,
        },
        {
          name: "conversion_policy_allocation",
          expectedConstraint:
            "conversions_cashback_policy_allocation_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.conversions (
              external_order_id, publisher_id, advertiser_id, campaign_id,
              offer_id, tracking_link_id, network, status, order_amount,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, occurred_at
            )
            VALUES (
              'phase20k-conversion-allocation', ${PUBLISHER_ID},
              'phase20k-advertiser', 'phase20k-campaign', 'phase20k-offer',
              'phase20k-link', 'shopee', 'pending', 1000, 1000, 601, 399,
              6000, now()
            )
          `,
        },
        {
          name: "audit_policy_allocation",
          expectedConstraint:
            "reconciliation_audit_events_cashback_policy_allocation_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_audit_events (
              network, source_conversion_key, idempotency_key, conversion_id,
              previous_status, next_status, decision, reason_code, human_reason,
              network_commission, user_cashback, platform_profit,
              cashback_share_bps_snapshot, actor_kind, reconciliation_run_id
            )
            VALUES (
              'shopee', repeat('7', 64), repeat('8', 64),
              '20000000-0000-4000-8000-000000000050', 'pending', 'approved',
              'approve', 'phase20k_allocation',
              'Phase 20K invalid allocation audit row',
              1000, 601, 399, 6000, 'system', ${RUN_ID}
            )
          `,
        },
        {
          name: "candidate_policy_allocation",
          expectedConstraint:
            "reconciliation_run_candidates_cashback_policy_allocation_check",
          execute: (savepoint) => savepoint`
            INSERT INTO public.reconciliation_run_candidates (
              id, run_id, conversion_id, source_conversion_key, network,
              expected_previous_status, intended_next_status,
              planned_reason_code, planned_money_network_commission,
              planned_money_user_cashback, planned_money_platform_profit,
              planned_cashback_share_bps, planned_idempotency_key,
              provenance_fingerprint
            )
            VALUES (
              '20000000-0000-4000-8000-000000000060', ${RUN_ID},
              '20000000-0000-4000-8000-000000000061', repeat('9', 64),
              'shopee', 'pending', 'approved', 'phase20k_allocation',
              1000, 601, 399, 6000, repeat('a', 64),
              'phase20k-invalid-allocation-provenance'
            )
          `,
        },
      ];

      for (const constraintCase of cases) {
        await runConstraintCase(tx, constraintCase);
        console.log(
          `NEGATIVE_CONSTRAINT_CASE=${constraintCase.name}:PASS sqlstate=23514 constraint=${constraintCase.expectedConstraint}`,
        );
      }
      assert.equal(cases.length, 9);
      console.log(
        "NEGATIVE_CONSTRAINT_MATRIX=PASS case_count=9 sqlstate_and_exact_name_assertions=PASS",
      );

      // Every fixture and successful control row is removed atomically.
      throw new Error("phase20k_constraint_test_rollback");
    }).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "phase20k_constraint_test_rollback"
      ) {
        return;
      }
      throw error;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
