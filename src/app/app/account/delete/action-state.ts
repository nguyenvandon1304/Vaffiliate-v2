/**
 * Phase 20I.6 -- account-deletion action state and initial value.
 *
 * This file has NO "use server" directive. It contains only:
 *   - TypeScript type definitions
 *   - Plain serializable constants
 *
 * These are safe to import from both client components and server
 * action files without causing a Next.js server-action proxy leak.
 */

/**
 * Result of the action after the foundation flow has accepted the
 * request. The action always returns one of these -- never throws --
 * so the form can render a calm message.
 */
export type DeletionActionState =
  | {
      readonly ok: true;
      readonly status: "submitted";
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

/**
 * Initial state passed to `useActionState`. Mirrors the
 * "unsubmitted" branch.
 */
export const INITIAL_DELETION_ACTION_STATE: DeletionActionState = {
  ok: false,
  message: "",
};
