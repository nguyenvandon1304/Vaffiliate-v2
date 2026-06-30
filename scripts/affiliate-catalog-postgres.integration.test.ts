import assert from "node:assert/strict";
import {
  spawn,
  type ChildProcess,
} from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const PUBLISHER_ID =
  "00000000-0000-4000-8000-000000000001";

const TRACKING_LINK_ID =
  "00000000-0000-4000-8000-000000000002";

const ADVERTISER_ID =
  "ci-shopee-advertiser";

const CAMPAIGN_ID =
  "ci-shopee-campaign";

const OFFER_ID =
  "ci-shopee-offer";

const WORKER_A =
  "vaffiliate-classification-worker-a";

const WORKER_B =
  "vaffiliate-classification-worker-b";

const WORKER_PATH = fileURLToPath(
  new URL(
    "./classify-shopee-tracking-link-worker.ts",
    import.meta.url,
  ),
);

interface WorkerOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface ClassificationResult {
  trackingLinkId: string;
  campaignId: string;
  offerId: string;
  classified: boolean;
}

interface RunningWorker {
    child: ChildProcess;
  result: Promise<WorkerOutcome>;
}

function requireDatabaseUrl(): string {
  const databaseUrl =
    process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for PostgreSQL integration tests",
    );
  }

  return databaseUrl;
}

function withApplicationName(
  databaseUrl: string,
  applicationName: string,
): string {
  const url = new URL(databaseUrl);

  url.searchParams.set(
    "application_name",
    applicationName,
  );

  return url.toString();
}

function startWorker(
  databaseUrl: string,
  applicationName: string,
): RunningWorker {
  const nodeOptions = [
    process.env.NODE_OPTIONS,
    "--conditions=react-server",
  ]
    .filter(Boolean)
    .join(" ");

  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      WORKER_PATH,
    ],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        DATABASE_URL: withApplicationName(
          databaseUrl,
          applicationName,
        ),
        TEST_PUBLISHER_ID: PUBLISHER_ID,
        TEST_TRACKING_LINK_ID:
          TRACKING_LINK_ID,
        TEST_OFFER_ID: OFFER_ID,
      },
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const result =
    new Promise<WorkerOutcome>(
      (resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          child.kill();

          reject(
            new Error(
              `${applicationName} timed out`,
            ),
          );
        }, 15_000);

        child.once("error", (error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          reject(error);
        });

        child.once(
          "close",
          (code, signal) => {
            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timer);

            resolve({
              code,
              signal,
              stdout,
              stderr,
            });
          },
        );
      },
    );

  return {
    child,
    result,
  };
}

async function waitForBothWorkersToBlock(
  admin: ReturnType<typeof postgres>,
): Promise<void> {
  const deadline =
    Date.now() + 10_000;

  while (Date.now() < deadline) {
    const rows = await admin`
      SELECT
        application_name,
        wait_event_type
      FROM pg_stat_activity
      WHERE application_name IN (
        ${WORKER_A},
        ${WORKER_B}
      )
    `;

    const waitStates = new Map(
      rows.map((row) => [
        String(row.application_name),
        row.wait_event_type === null
          ? null
          : String(row.wait_event_type),
      ]),
    );

    if (
      waitStates.get(WORKER_A) === "Lock"
      && waitStates.get(WORKER_B) === "Lock"
    ) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(
    "Both classification workers did not reach PostgreSQL lock waits",
  );
}

function parseWorkerResult(
  applicationName: string,
  outcome: WorkerOutcome,
): ClassificationResult {
  assert.equal(
    outcome.code,
    0,
    `${applicationName} failed: ${outcome.stderr}`,
  );

  assert.equal(
    outcome.signal,
    null,
    `${applicationName} was terminated by ${outcome.signal}`,
  );

  const outputLine = outcome.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);

  assert.ok(
    outputLine,
    `${applicationName} returned no JSON result`,
  );

  return JSON.parse(
    outputLine,
  ) as ClassificationResult;
}

test(
  "concurrent classification is serialized and idempotent",
  {
    timeout: 30_000,
  },
  async () => {
    const databaseUrl =
      requireDatabaseUrl();

    const admin = postgres(
      withApplicationName(
        databaseUrl,
        "vaffiliate-integration-admin",
      ),
      {
        max: 2,
        prepare: false,
      },
    );

    const blocker = postgres(
      withApplicationName(
        databaseUrl,
        "vaffiliate-integration-blocker",
      ),
      {
        max: 1,
        prepare: false,
      },
    );

    const workers: RunningWorker[] = [];

    try {
      await admin.begin(async (transaction) => {
        await transaction`
          DELETE FROM tracking_links
          WHERE id = ${TRACKING_LINK_ID}::uuid
        `;

        await transaction`
          DELETE FROM cashback_policies
          WHERE offer_id = ${OFFER_ID}
        `;

        await transaction`
          DELETE FROM offers
          WHERE id = ${OFFER_ID}
        `;

        await transaction`
          DELETE FROM campaigns
          WHERE id = ${CAMPAIGN_ID}
        `;

        await transaction`
          DELETE FROM advertisers
          WHERE id = ${ADVERTISER_ID}
        `;

        await transaction`
          DELETE FROM profiles
          WHERE user_id = ${PUBLISHER_ID}::uuid
        `;

        await transaction`
          DELETE FROM auth.users
          WHERE id = ${PUBLISHER_ID}::uuid
        `;

        await transaction`
          INSERT INTO auth.users (
            id,
            raw_user_meta_data
          )
          VALUES (
            ${PUBLISHER_ID}::uuid,
            '{}'::jsonb
          )
          ON CONFLICT (id) DO NOTHING
        `;

        await transaction`
          INSERT INTO profiles (
            user_id
          )
          VALUES (
            ${PUBLISHER_ID}::uuid
          )
          ON CONFLICT (user_id) DO NOTHING
        `;

        await transaction`
          INSERT INTO advertisers (
            id,
            name,
            platform,
            status
          )
          VALUES (
            ${ADVERTISER_ID},
            'CI Shopee Advertiser',
            'shopee',
            'active'
          )
        `;

        await transaction`
          INSERT INTO campaigns (
            id,
            advertiser_id,
            name,
            status
          )
          VALUES (
            ${CAMPAIGN_ID},
            ${ADVERTISER_ID},
            'CI Shopee Campaign',
            'active'
          )
        `;

        await transaction`
          INSERT INTO offers (
            id,
            campaign_id,
            name,
            status
          )
          VALUES (
            ${OFFER_ID},
            ${CAMPAIGN_ID},
            'CI Shopee Offer',
            'active'
          )
        `;

        await transaction`
          INSERT INTO cashback_policies (
            offer_id,
            cashback_share_bps
          )
          VALUES (
            ${OFFER_ID},
            6000
          )
        `;

        await transaction`
          INSERT INTO tracking_links (
            id,
            publisher_id,
            platform,
            destination_url,
            affiliate_url,
            campaign_id,
            offer_id,
            network_sub_id,
            short_code,
            status
          )
          VALUES (
            ${TRACKING_LINK_ID}::uuid,
            ${PUBLISHER_ID}::uuid,
            'shopee',
            'https://shopee.vn/ci-product',
            NULL,
            NULL,
            NULL,
            'vaflnk111111111111111111111111',
            'ciTestLink01',
            'active'
          )
        `;
      });

      await blocker.begin(
        async (transaction) => {
          const lockedRows =
            await transaction`
              SELECT id
              FROM tracking_links
              WHERE id =
                ${TRACKING_LINK_ID}::uuid
              FOR UPDATE
            `;

          assert.equal(
            lockedRows.length,
            1,
          );

          workers.push(
            startWorker(
              databaseUrl,
              WORKER_A,
            ),
            startWorker(
              databaseUrl,
              WORKER_B,
            ),
          );

          await waitForBothWorkersToBlock(
            admin,
          );
        },
      );

      const outcomes =
        await Promise.all(
          workers.map(
            (worker) => worker.result,
          ),
        );

      const results = [
        parseWorkerResult(
          WORKER_A,
          outcomes[0],
        ),
        parseWorkerResult(
          WORKER_B,
          outcomes[1],
        ),
      ];

      assert.deepEqual(
        results
          .map((result) =>
            result.classified,
          )
          .sort(),
        [
          false,
          true,
        ],
      );

      for (const result of results) {
        assert.equal(
          result.trackingLinkId,
          TRACKING_LINK_ID,
        );

        assert.equal(
          result.campaignId,
          CAMPAIGN_ID,
        );

        assert.equal(
          result.offerId,
          OFFER_ID,
        );
      }

      const classifiedRows = await admin`
        SELECT
          campaign_id,
          offer_id
        FROM tracking_links
        WHERE id =
          ${TRACKING_LINK_ID}::uuid
      `;

      assert.equal(
        classifiedRows.length,
        1,
      );

      assert.equal(
        classifiedRows[0].campaign_id,
        CAMPAIGN_ID,
      );

      assert.equal(
        classifiedRows[0].offer_id,
        OFFER_ID,
      );
    } finally {
      for (const worker of workers) {
        if (
          worker.child.exitCode === null
          && !worker.child.killed
        ) {
          worker.child.kill();
        }
      }

      try {
        await admin.begin(
          async (transaction) => {
            await transaction`
              DELETE FROM tracking_links
              WHERE id =
                ${TRACKING_LINK_ID}::uuid
            `;

            await transaction`
              DELETE FROM cashback_policies
              WHERE offer_id = ${OFFER_ID}
            `;

            await transaction`
              DELETE FROM offers
              WHERE id = ${OFFER_ID}
            `;

            await transaction`
              DELETE FROM campaigns
              WHERE id = ${CAMPAIGN_ID}
            `;

            await transaction`
              DELETE FROM advertisers
              WHERE id = ${ADVERTISER_ID}
            `;

            await transaction`
              DELETE FROM profiles
              WHERE user_id =
                ${PUBLISHER_ID}::uuid
            `;

            await transaction`
              DELETE FROM auth.users
              WHERE id =
                ${PUBLISHER_ID}::uuid
            `;
          },
        );
      } finally {
        await Promise.allSettled([
          admin.end({
            timeout: 1,
          }),
          blocker.end({
            timeout: 1,
          }),
        ]);
      }
    }
  },
);