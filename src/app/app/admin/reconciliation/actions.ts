"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { recordAdminAction } from "@/lib/auth/audit-log";
import { requireAdmin } from "@/lib/auth/server-guard";

import {
  type ReconciliationAppliedRow,
  type ReconciliationSkippedRow,
  type RunReconciliationActionState,
} from "./action-state";
import { readBoundedSourceScope } from "./scope-parser";
import {
  commitReconciliationAsync,
  dryRunReconciliationAsync,
} from "@/server/reconciliation/reconciliation.repository";
import {
  buildReconciliationAdminActor,
  type ReconciliationActor,
} from "@/lib/reconciliation/actor";

const ERR_NO_ADMIN_SESSION =
  "Vui lòng đăng nhập với tài khoản quản trị để chạy đối soát.";
const ERR_DRY_RUN_FAILED =
  "Không thể chạy đối soát khô. Vui lòng thử lại hoặc liên hệ kỹ thuật.";
const ERR_COMMIT_FAILED =
  "Không thể áp dụng đối soát. Vui lòng thử lại hoặc liên hệ kỹ thuật.";
const ERR_INVALID_RUN_ID =
  "Run id không hợp lệ. Vui lòng chạy Dry run trước khi Commit.";
const ERR_SCOPE_REQUIRED =
  "Phải cung cấp source scope giới hạn (ingestionEventIds / sourceConversionKeys / " +
  "occurredAfter+occurredBefore).";

function buildActor(input: {
  readonly userId: string;
  readonly role: string | null;
}): { actor: ReconciliationActor; actorRole: "admin" | "super_admin" } {
  const actorRole: "admin" | "super_admin" =
    input.role === "super_admin" ? "super_admin" : "admin";
  const actor = buildReconciliationAdminActor({
    actorUserId: input.userId,
    actorRole,
  });
  return { actor, actorRole };
}

export async function runReconciliationAction(
  _previousState: RunReconciliationActionState,
  formData: FormData,
): Promise<RunReconciliationActionState> {
  let adminSession;
  try {
    adminSession = await requireAdmin("/app/admin/reconciliation");
  } catch {
    return { ok: false, message: ERR_NO_ADMIN_SESSION };
  }
  if (!adminSession.role) {
    return { ok: false, message: ERR_NO_ADMIN_SESSION };
  }
  const { actor, actorRole } = buildActor({
    userId: adminSession.userId,
    role: adminSession.role,
  });

  const intentRaw = formData.get("intent");
  const intent = typeof intentRaw === "string" ? intentRaw : "";
  const mode: "dry_run" | "commit" = intent === "commit" ? "commit" : "dry_run";
  const networkRaw = formData.get("network");
  const network =
    networkRaw === "shopee" || networkRaw === "manual"
      ? networkRaw
      : "shopee";

  try {
    if (mode === "dry_run") {
      const sourceScope = readBoundedSourceScope(formData);
      const hasScope =
        (sourceScope.ingestionEventIds?.length ?? 0) > 0 ||
        (sourceScope.sourceConversionKeys?.length ?? 0) > 0 ||
        (typeof sourceScope.occurredAfter === "string" &&
          typeof sourceScope.occurredBefore === "string" &&
          sourceScope.occurredAfter.length > 0 &&
          sourceScope.occurredBefore.length > 0);
      if (!hasScope) {
        return { ok: false, message: ERR_SCOPE_REQUIRED };
      }
      const dryResult = await dryRunReconciliationAsync({
        network,
        actor,
        sourceScope,
      });

      recordAdminAction({
        kind: "admin.reconciliation.dry_run",
        actorUserId: adminSession.userId,
        actorRole,
        targetType: "reconciliation_run",
        targetId: dryResult.reconciliationRunId,
        metadata: {
          network,
          reconciliationRunId: dryResult.reconciliationRunId,
          scannedRowCount: dryResult.scannedRowCount,
          applied: dryResult.summary.applied,
          skipped: dryResult.summary.skipped,
          totalNetworkCommission: dryResult.summary.totals.networkCommission,
          totalUserCashback: dryResult.summary.totals.userCashback,
          totalPlatformProfit: dryResult.summary.totals.platformProfit,
        },
      });

      const sampleDecisions = dryResult.decisions.slice(0, 12).map((d) => ({
        kind: d.kind,
        reasonCode: d.reasonCode,
      }));

      return {
        ok: true,
        mode: "dry_run",
        network,
        reconciliationRunId: dryResult.reconciliationRunId,
        summary: dryResult.summary,
        applied: [] as ReadonlyArray<ReconciliationAppliedRow>,
        skipped: [] as ReadonlyArray<ReconciliationSkippedRow>,
        committedAt: dryResult.scannedAt,
        scannedRowCount: dryResult.scannedRowCount,
        sampleDecisions,
      };
    }

    const runIdRaw = formData.get("reconciliation_run_id");
    const reconciliationRunId =
      typeof runIdRaw === "string" ? runIdRaw : "";
    if (reconciliationRunId.length === 0) {
      return { ok: false, message: ERR_INVALID_RUN_ID };
    }

    const commitResult = await commitReconciliationAsync({
      actorUserId: adminSession.userId,
      actorRole,
      reconciliationRunId,
    });

    revalidatePath("/app/admin/reconciliation");

    const applied: ReadonlyArray<ReconciliationAppliedRow> =
      commitResult.applied.map((decision) => ({
        conversionId: decision.conversionId,
        previousStatus: decision.previousStatus,
        nextStatus: decision.nextStatus,
        reasonCode: decision.reasonCode,
        networkCommission:
          decision.kind === "apply"
            ? decision.plannedMoneyNetworkCommission
            : decision.plannedMoneyNetworkCommission,
        userCashback:
          decision.kind === "apply"
            ? decision.plannedMoneyUserCashback
            : decision.plannedMoneyUserCashback,
        platformProfit:
          decision.kind === "apply"
            ? decision.plannedMoneyPlatformProfit
            : decision.plannedMoneyPlatformProfit,
        idempotencyKeyShort: decision.plannedIdempotencyKey.slice(0, 16),
      }));
    const skipped: ReadonlyArray<ReconciliationSkippedRow> =
      commitResult.skipped.map((s) => ({
        conversionId: s.conversionId,
        reasonCode: s.reasonCode,
        idempotentReplay: s.idempotentReplay === true,
      }));

    return {
      ok: true,
      mode: "commit",
      network,
      reconciliationRunId: commitResult.reconciliationRunId,
      summary: commitResult.summary,
      applied,
      skipped,
      committedAt: commitResult.committedAt,
      scannedRowCount: commitResult.scannedRowCount,
      sampleDecisions: [],
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : mode === "dry_run"
          ? ERR_DRY_RUN_FAILED
          : ERR_COMMIT_FAILED;
    return { ok: false, message };
  }
}