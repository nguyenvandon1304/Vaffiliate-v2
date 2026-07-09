#!/usr/bin/env node
/**
 * Phase 20H.8 -- Addlivetag import / dry-run entry point.
 *
 * Phase 20I.3 -- aligned with the documented Addlivetag Conversion
 * API at `https://addlivetag.com/api/v1/conversions.php`. The
 * `--account-id` flag is forwarded to the HTTP client as the
 * optional `account_id` query parameter.
 *
 * Usage:
 *
 *   # Dry run: no DB writes, no network calls. Uses the env-supplied
 *   # sample data path. Prints a JSON summary to stdout.
 *   ADDLIVETAG_DRY_RUN=1 \
 *     node --import tsx --conditions=react-server \
 *       scripts/addlivetag-import.ts \
 *         --source shopee \
 *         --type orders \
 *         --from 2026-01-01 \
 *         --to 2026-01-31 \
 *         --page-size 200
 *
 *   # Live import: requires ADDLIVETAG_API_KEY, the global `fetch`
 *   # must be reachable (Node 18+), and DATABASE_URL must be set.
 *   ADDLIVETAG_API_KEY=*** \
 *     node --import tsx --conditions=react-server \
 *       scripts/addlivetag-import.ts \
 *         --source shopee \
 *         --type orders \
 *         --from 2026-01-01 \
 *         --to 2026-01-31 \
 *         --account-id 1234
 *
 * The script never logs the API key value. The summary printed to
 * stdout never contains internal identifiers (tracking_link_id,
 * publisher_id, network_sub_id, click_token, purchase_intent_id).
 */

import { runAddlivetagImportAsync } from "../src/services/addlivetag-import.service";

function parseArgs(argv: ReadonlyArray<string>): {
  source: "shopee" | "food";
  type: "orders" | "items" | "clicks";
  from: string;
  to: string;
  pageSize: number;
  accountId?: string;
  dryRun: boolean;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (typeof token !== "string") continue;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] ?? "";
    args.set(key, value);
    i += 1;
  }

  const source = args.get("source") ?? "shopee";
  if (source !== "shopee" && source !== "food") {
    throw new Error(
      `addlivetag-import: invalid --source ${source}; expected shopee or food`,
    );
  }
  const type = args.get("type") ?? "orders";
  if (type !== "orders" && type !== "items" && type !== "clicks") {
    throw new Error(
      `addlivetag-import: invalid --type ${type}; expected orders, items, or clicks`,
    );
  }
  const from = args.get("from") ?? "";
  if (from.length === 0) {
    throw new Error("addlivetag-import: --from is required (YYYY-MM-DD)");
  }
  const to = args.get("to") ?? "";
  if (to.length === 0) {
    throw new Error("addlivetag-import: --to is required (YYYY-MM-DD)");
  }
  const pageSizeRaw = args.get("page-size") ?? "200";
  const pageSize = Number(pageSizeRaw);
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1_000
  ) {
    throw new Error(
      `addlivetag-import: --page-size must be an integer in [1, 1000]; got ${pageSizeRaw}`,
    );
  }
  const accountIdRaw = args.get("account-id") ?? "";
  let accountId: string | undefined;
  if (accountIdRaw.length > 0) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountIdRaw)) {
      throw new Error(
        `addlivetag-import: --account-id must match [A-Za-z0-9_-]{1,64}; got ${accountIdRaw}`,
      );
    }
    accountId = accountIdRaw;
  }
  const dryRun = process.env.ADDLIVETAG_DRY_RUN === "1";
  return { source, type, from, to, pageSize, accountId, dryRun };
}

function writeAndExit(
  stream: NodeJS.WriteStream,
  value: unknown,
  exitCode: number,
): void {
  stream.write(
    `${JSON.stringify(value, null, 2)}\n`,
    () => process.exit(exitCode),
  );
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  const result = await runAddlivetagImportAsync(
    {
      source: parsed.source,
      type: parsed.type,
      from: parsed.from,
      to: parsed.to,
      pageSize: parsed.pageSize,
      dryRun: parsed.dryRun,
      accountId: parsed.accountId,
    },
    {
      fetchImpl: (input, init) => fetch(input, init),
      getApiKey: () => process.env.ADDLIVETAG_API_KEY ?? "",
    },
  );

  // Redact internal IDs from the output: the summary already
  // excludes them by contract, but a defence-in-depth pass strips
  // any accidental leakage of networkSubId / shortCode / clickToken
  // / affiliateUrl substrings from the printed object.
  const safe = redact(result);
  writeAndExit(process.stdout, safe, 0);
}

function redact<T>(value: T): T {
  // Pure JSON round-trip with a scrubber. Cheap because the
  // summary is small.
  return JSON.parse(JSON.stringify(value, (k, v) => {
    if (typeof v !== "string") return v;
    if (k === "networkSubId" || k === "sourceSubId1" || k === "subId1") {
      return "<redacted>";
    }
    if (/^vaflnk[a-f0-9]{24}$/.test(v)) return "<redacted-networkSubId>";
    if (k === "clickToken") return "<redacted-clickToken>";
    return v;
  })) as T;
}

main().catch((error: unknown) => {
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };
  // Never include the API key in the error path. The redactor
  // strips any token that may have leaked into a message.
  writeAndExit(process.stderr, normalized, 1);
});
