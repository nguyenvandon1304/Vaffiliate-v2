import assert from "node:assert/strict";
import test from "node:test";
import { buildPasswordResetRedirect, requestPasswordResetRedirect } from "./password-reset";

test("password reset redirect uses configured site origin", () => {
  assert.equal(buildPasswordResetRedirect("https://vaffiliate-v2-dev.vercel.app/"), "https://vaffiliate-v2-dev.vercel.app/reset-password");
});

test("password reset redirect strips a path from the configured URL", () => {
  assert.equal(buildPasswordResetRedirect("https://example.com/account"), "https://example.com/reset-password");
});

function resetForm(email = "  Buyer@Example.com  ") {
  const form = new FormData();
  form.set("email", email);
  return form;
}

test("successful recovery request uses normalized email and configured redirect", async () => {
  const calls: unknown[] = [];
  const destination = await requestPasswordResetRedirect(resetForm(), {
    getOrigin: async () => "https://vaffiliate-v2-dev.vercel.app/",
    createClient: async () => ({ auth: {
      async resetPasswordForEmail(email, options) {
        calls.push({ email, options });
        return { error: null };
      },
    } }),
  });
  assert.deepEqual(calls, [{
    email: "buyer@example.com",
    options: { redirectTo: "https://vaffiliate-v2-dev.vercel.app/reset-password" },
  }]);
  assert.equal(destination, "/login?message=reset-email-sent");
});

for (const status of [404, 429, 500]) {
  test(`Supabase recover ${status} returns a generic error, never success or provider details`, async (t) => {
    const log = t.mock.method(console, "log", () => {});
    const warn = t.mock.method(console, "warn", () => {});
    const errorLog = t.mock.method(console, "error", () => {});
    const destination = await requestPasswordResetRedirect(resetForm(), {
      getOrigin: async () => "https://vaffiliate-v2-dev.vercel.app",
      createClient: async () => ({ auth: {
        resetPasswordForEmail: async () => ({ error: {
          status,
          message: "buyer@example.com sensitive-token https://private.example/connection",
        } }),
      } }),
    });
    assert.equal(destination, "/login?error=reset-email-failed");
    assert.equal(log.mock.callCount() + warn.mock.callCount() + errorLog.mock.callCount(), 0);
  });
}

test("unknown and existing accounts with a successful provider response share a destination", async () => {
  const destinations = [];
  for (const email of ["existing@example.com", "unknown@example.com"]) {
    destinations.push(await requestPasswordResetRedirect(resetForm(email), {
      getOrigin: async () => "https://example.com",
      createClient: async () => ({ auth: {
        resetPasswordForEmail: async () => ({ error: null }),
      } }),
    }));
  }
  assert.deepEqual(destinations, ["/login?message=reset-email-sent", "/login?message=reset-email-sent"]);
});

for (const stage of ["origin", "client", "recover"]) {
  test(`thrown ${stage} failure is sanitized`, async () => {
    const fail = () => { throw new Error("sensitive-token buyer@example.com"); };
    const destination = await requestPasswordResetRedirect(resetForm(), {
      getOrigin: async () => stage === "origin" ? fail() : "https://example.com",
      createClient: async () => {
        if (stage === "client") fail();
        return { auth: { resetPasswordForEmail: async () => fail() } };
      },
    });
    assert.equal(destination, "/login?error=reset-email-failed");
  });
}

test("missing email stops before constructing the client", async () => {
  let called = false;
  const destination = await requestPasswordResetRedirect(resetForm("  "), {
    getOrigin: async () => { called = true; return "https://example.com"; },
    createClient: async () => { called = true; throw new Error("must not run"); },
  });
  assert.equal(destination, "/login?error=missing-email");
  assert.equal(called, false);
});
