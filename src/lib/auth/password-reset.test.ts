import assert from "node:assert/strict";
import test from "node:test";
import { buildPasswordResetRedirect } from "./password-reset";

test("password reset redirect uses configured site origin", () => {
  assert.equal(buildPasswordResetRedirect("https://vaffiliate-v2-dev.vercel.app/"), "https://vaffiliate-v2-dev.vercel.app/reset-password");
});

test("password reset redirect strips a path from the configured URL", () => {
  assert.equal(buildPasswordResetRedirect("https://example.com/account"), "https://example.com/reset-password");
});
