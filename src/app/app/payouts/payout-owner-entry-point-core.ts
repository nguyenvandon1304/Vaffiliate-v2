/**
 * Phase 20M.2 -- owner payout entry-point core.
 *
 * Dependency-injected so the whole boundary can be unit tested
 * without a request scope, a Supabase client, or a database. The
 * production wiring lives in `./payout-owner.server.ts`; the
 * `"use server"` actions in `./actions.ts` are thin adapters over
 * this factory.
 *
 * Boundary contract:
 *
 *   - `requireUser` runs FIRST on every operation. Owner identity is
 *     derived exclusively from the Supabase session; no entry point
 *     accepts a user id, owner id, actor id, amount, or status.
 *   - Only the approved Phase 20M.1 owner service is invoked. The
 *     entry point never touches a repository, a Supabase client, or
 *     a table.
 *   - `rethrow` is `unstable_rethrow` in production. It must run
 *     before any error mapping so a `NEXT_REDIRECT` thrown by
 *     `requireUser` propagates to the framework instead of being
 *     flattened into a payout error.
 *   - `revalidate` is called ONLY after a mutation succeeds, and only
 *     for exact owner payout paths.
 */

import {
  parseCreatePayoutCommand,
  parsePayoutRequestCommand,
  parsePayoutRequestId,
  toPayoutFailure,
  toPublicOwnedPayoutRequest,
  toPublicPayoutMutation,
  toPublicPayoutRequestSummary,
  type PayoutEntryPointResult,
  type PublicOwnedPayoutRequest,
  type PublicPayoutMutation,
  type PublicPayoutRequestSummary,
} from "@/lib/payout/entry-point";
import type {
  CancelPayoutRequestInput,
  CreatePayoutRequestInput,
  OwnedPayoutRequest,
  PayoutMutationResult,
  PayoutRequestSummary,
} from "@/types/payout";

export const OWNER_PAYOUT_PATH = "/app/payouts";

export function ownerPayoutDetailPath(payoutRequestId: string): string {
  return `${OWNER_PAYOUT_PATH}/${payoutRequestId}`;
}

export interface PayoutOwnerEntryPointDependencies {
  readonly requireUser: (nextPath: string) => Promise<unknown>;
  readonly service: {
    readonly listRequests: () => Promise<readonly PayoutRequestSummary[]>;
    readonly loadRequest: (
      payoutRequestId: string,
    ) => Promise<OwnedPayoutRequest>;
    readonly createRequest: (
      input: CreatePayoutRequestInput,
    ) => Promise<PayoutMutationResult>;
    readonly cancelRequest: (
      input: CancelPayoutRequestInput,
    ) => Promise<PayoutMutationResult>;
  };
  readonly revalidate: (path: string) => void;
  readonly rethrow: (error: unknown) => void;
}

export function createPayoutOwnerEntryPoint(
  dependencies: PayoutOwnerEntryPointDependencies,
) {
  function failure<TData>(error: unknown): PayoutEntryPointResult<TData> {
    // Framework control-flow signals (NEXT_REDIRECT from requireUser,
    // notFound, etc.) must escape untouched.
    dependencies.rethrow(error);
    return toPayoutFailure<TData>(error);
  }

  return Object.freeze({
    async listRequests(): Promise<
      PayoutEntryPointResult<readonly PublicPayoutRequestSummary[]>
    > {
      try {
        await dependencies.requireUser(OWNER_PAYOUT_PATH);
        const requests = await dependencies.service.listRequests();
        return { ok: true, data: requests.map(toPublicPayoutRequestSummary) };
      } catch (error) {
        return failure(error);
      }
    },

    async loadRequest(
      payoutRequestId: unknown,
    ): Promise<PayoutEntryPointResult<PublicOwnedPayoutRequest>> {
      try {
        await dependencies.requireUser(OWNER_PAYOUT_PATH);
        const requestId = parsePayoutRequestId(payoutRequestId);
        const owned = await dependencies.service.loadRequest(requestId);
        return { ok: true, data: toPublicOwnedPayoutRequest(owned) };
      } catch (error) {
        return failure(error);
      }
    },

    async createRequest(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireUser(OWNER_PAYOUT_PATH);
        const command = parseCreatePayoutCommand(input);
        const result = await dependencies.service.createRequest({
          payoutAccountId: command.payoutAccountId,
          idempotencyKey: command.idempotencyKey,
        });
        dependencies.revalidate(OWNER_PAYOUT_PATH);
        return { ok: true, data: toPublicPayoutMutation(result) };
      } catch (error) {
        return failure(error);
      }
    },

    async cancelRequest(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireUser(OWNER_PAYOUT_PATH);
        const command = parsePayoutRequestCommand(input);
        const result = await dependencies.service.cancelRequest({
          payoutRequestId: command.payoutRequestId,
          idempotencyKey: command.idempotencyKey,
        });
        dependencies.revalidate(OWNER_PAYOUT_PATH);
        dependencies.revalidate(
          ownerPayoutDetailPath(command.payoutRequestId),
        );
        return { ok: true, data: toPublicPayoutMutation(result) };
      } catch (error) {
        return failure(error);
      }
    },
  });
}
