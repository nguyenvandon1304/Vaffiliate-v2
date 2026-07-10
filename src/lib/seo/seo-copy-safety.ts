/**
 * Phase 20I.7 -- copy-safety helpers for the public SEO surface.
 *
 * Reuses the Phase 20I.6 `policy-content.ts` token / phrase list
 * and extends it with the broader set the Phase 20I.7 brief
 * forbids on public marketing copy.
 *
 * Why not just call `assertPolicyCopyIsSafe()` directly:
 *
 *   - The policy module is about legal pages. The public SEO
 *     surface has its own invariant: no overpromise in any
 *     buyer-facing string we ship, regardless of which file
 *     the string lives in. Coupling the broader invariant to a
 *     single helper keeps the audit consistent and lets new
 *     surfaces (deal guides, blog CMS in the future, marketing
 *     landing pages) reuse the same check.
 *
 * The exported `assertBuyerFacingCopyIsSafe()` walks any number
 * of arbitrary strings and throws on the first forbidden token /
 * phrase. The tests in `seo-copy-safety.test.ts` exercise this
 * helper end-to-end.
 */

import {
  FORBIDDEN_BUYER_FACING_PHRASES,
  FORBIDDEN_BUYER_FACING_TOKENS,
} from "@/lib/policy/policy-content";

/**
 * The brief asks for the broader set. We merge it on top of the
 * policy copy list. Substrings are case-insensitive. The standalone
 * single-word phrases ("cam kết", "đảm bảo", "chắc chắn") are
 * added explicitly so copy drift that uses any of them in any
 * context (including a clarifying / negative sentence) is also
 * caught. The longer contextual phrases (e.g. "cam kết hoàn
 * tiền", "đảm bảo được duyệt", "chắc chắn có hoàn tiền") are
 * kept for clearer error messages.
 *
 * Order matters: longer phrases are listed before the standalone
 * ones so the error message cites the more specific phrase when
 * both match. (The substring check below matches either way;
 * ordering just changes which one is reported.)
 */
const PHASE_20I7_EXTRA_PHRASES: ReadonlyArray<string> = [
  // Longer contextual phrases (kept from the prior list).
  "cam kết hoàn tiền",
  "đảm bảo được duyệt",
  "chắc chắn có hoàn tiền",
  "mua là có hoàn tiền",
  "hoàn tiền chắc chắn",
  "google sẽ đề xuất",
  "được google đề xuất",
  "đề xuất của google",
  "lên top google",
  "lên top",
  "ch play chắc chắn",
  "app store chắc chắn",
  "100% chắc chắn",
  // Standalone forbidden single words. These match anywhere in
  // the copy -- even in a negative sentence like "Vaffiliate
  // không thể đảm bảo ..." is still banned, because the word
  // itself is what the brief forbids on buyer-facing copy.
  "cam kết",
  "đảm bảo",
  "chắc chắn",
];

const ALL_FORBIDDEN_PHRASES: ReadonlyArray<string> = [
  ...FORBIDDEN_BUYER_FACING_PHRASES,
  ...PHASE_20I7_EXTRA_PHRASES,
];

export interface BuyerFacingCopyCheck {
  /** Stable label for the caller, used in the error message. */
  readonly label: string;
  /** The string(s) to audit. Multi-line input is normalised. */
  readonly text: string;
}

/**
 * Audit every provided string against the broader forbidden
 * token / phrase list. Throws on the first violation. Use during
 * construction of typed-data pages so copy drift fails fast at
 * the call site (still recommended to keep unit tests on top).
 */
export function assertBuyerFacingCopyIsSafe(
  pieces: ReadonlyArray<BuyerFacingCopyCheck>,
): void {
  for (const piece of pieces) {
    const haystack = piece.text.toLowerCase();
    for (const token of FORBIDDEN_BUYER_FACING_TOKENS) {
      const needle = token.toLowerCase();
      if (haystack.includes(needle)) {
        throw new Error(
          `${piece.label} contains forbidden internal token: ${token}`,
        );
      }
    }
    for (const phrase of ALL_FORBIDDEN_PHRASES) {
      const needle = phrase.toLowerCase();
      if (haystack.includes(needle)) {
        throw new Error(
          `${piece.label} contains forbidden buyer-facing phrase: ${phrase}`,
        );
      }
    }
  }
}

/**
 * Concatenate one or more pieces of buyer-facing copy into a
 * single string for sanity scanning at test time. Does not throw.
 */
export function combineBuyerFacingCopy(
  pieces: ReadonlyArray<BuyerFacingCopyCheck>,
): string {
  return pieces.map((p) => p.text).join("\n\n");
}

export const SEO_COPY_GUARD = {
  phrases: ALL_FORBIDDEN_PHRASES,
  tokens: FORBIDDEN_BUYER_FACING_TOKENS,
} as const;
