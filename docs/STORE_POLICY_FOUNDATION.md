# Store Policy Foundation -- Phase 20I.6

Internal planning document. NOT legal advice. NOT a substitute
for review by counsel and the store-review teams. Do not
present this file to end users.

This file is the foundation inventory that the Vaffiliate team
needs before submitting the project to Google Play (CH Play) and
Apple App Store. The web foundation is the submission unit for
the foreseeable future; native shells come later.

The doc is organised into:

1. Data categories collected / processed -- drives the
   Data Safety form on Google Play and the App Privacy labels
   on Apple App Store.
2. Linked vs not linked to user identity.
3. Tracking -- explicit "no tracking SDK yet" stance so the
   team can opt out of the cross-app tracking prompts until an
   SDK is actually added.
4. Third-party partners -- what is already in code, what
   needs review.
5. Deletion paths -- in-app / web link / support contact.
6. Encryption / security notes at a high level.
7. App Review access checklist.
8. Account-deletion implementation checklist.
9. Outstanding work that still blocks a real submission.

Do not advertise "ready to submit" anywhere until the
Outstanding Work section is empty.

---

## 1. Data categories collected / processed

| Category | Examples collected | Source | Purpose |
| --- | --- | --- | --- |
| Account data | email, internal user id | sign-up / Supabase Auth | run the account |
| Auth / session | session cookie, JWT claims | login / Supabase Auth | keep the user signed in |
| Order / cashback evidence | order id, order date, order value, status | Shopee and partners (Addlivetag) | reconcile cashback |
| Click / attribution evidence | click timestamp, hashed referral markers | tracking-link redirect | link orders to users |
| Payout / withdrawal (future) | payout account id, history | user-supplied | pay out cashback |
| Support / audit | support messages, admin audit log | user / internal | resolve tickets, audit admin actions |
| Technical logs | IP (truncated), device, browser, timestamps | proxy / server | operate, debug, anti-fraud |
| Third-party data | Shopee order data, Addlivetag account data | partners | reconcile, report |

## 2. Linked to user identity?

| Category | Linked? | Notes |
| --- | --- | --- |
| Account data | yes | primary key for everything else |
| Auth / session | yes | identifies the device session |
| Order / cashback evidence | yes | must be linked to attribute cashback |
| Click / attribution evidence | yes (after attribution) | pre-attribution click is anonymous |
| Payout / withdrawal | yes | by definition |
| Support / audit | yes (audit log) / by user id (support) | audit log records actor |
| Technical logs | no (after truncation) | logs do not carry raw user id |

## 3. Tracking

The codebase currently contains NO third-party tracking SDK
(Facebook SDK, TikTok SDK, Firebase Analytics, Adjust,
AppsFlyer, Branch). Until an SDK is intentionally added:

- Set the Data Safety / App Privacy answer to
  "Does your app collect or share required data types for
  tracking purposes?" = No.
- Set the iOS App Tracking Transparency prompt to
  not presented (NSUserTrackingUsageDescription not in
  Info.plist) until tracking is actually wired in.

Any new tracking SDK must trigger an immediate re-audit of this
document and a Data Safety / App Privacy update before release.

## 4. Third-party partners

| Partner | Data received | Notes |
| --- | --- | --- |
| Supabase | auth + sessions + (future) DB | managed, encrypted in transit + at rest |
| Shopee | order data, commission rates | affiliate program data only |
| Addlivetag | account-level aggregated order / item / click data | used for reconciliation only |

Every partner must be re-evaluated before launch:

- Confirm a signed Data Processing Addendum (DPA) is on file.
- Confirm the partner's security certifications (SOC2, ISO27001
  or equivalent) for the regions where Vaffiliate operates.
- Confirm a public privacy URL exists for the partner.

## 5. Deletion paths

| Path | Where | What it covers |
| --- | --- | --- |
| Web policy page | /data-deletion | explains the policy + retention |
| In-app / user area | /app/account/delete | authenticated deletion request form |
| Auth / login | -- | no in-login deletion prompt yet |
| Support contact | footer of every policy page | email contact for assisted requests |

In-app deletion flow (Phase 20I.6):

- Requires login (requireUser).
- Confirmation phrase + optional reason.
- Records the request in an in-memory foundation queue that
  resets on every server restart. No persistent storage exists in
  this phase. No hard delete in this phase.
- Returns a clear admin message; never claims immediate deletion.

## 6. Encryption / security (high level)

- TLS in transit (HSTS only when managed CDN is configured).
- Cookies marked HttpOnly + Secure + SameSite=Lax.
- Session refresh + role read isolated to server runtime
  (server-only import in server-guard.ts).
- Role checks never trust user_metadata.role (Phase 20I.5).
- Admin tools require admin or super_admin role, server-
  enforced at the layout layer AND inside each action.

## 7. App Review access checklist

For the future native shell, the store-review team will need:

- A demo user account with synthetic data (NO real Shopee
  credentials, NO real PII beyond a placeholder email).
- Demo admin account (only if the reviewer needs to enter the
  admin surface) with admin role set via the trusted
  app_metadata claim, never via user_metadata.
- Instructions to reach the demo data, the cashback report, the
  policy pages, and the deletion form.
- Test note: "cashback numbers shown in the demo are mock /
  foundation unless explicitly marked live".

## 8. Account-deletion implementation checklist

- [x] Public policy page (/data-deletion) reachable without login.
- [x] In-app deletion form (/app/account/delete) behind requireUser.
- [x] Foundation request shape (status, reason, requested_at,
      processed_at, processed_by, admin_note).
- [x] Admin visibility page (/app/admin/account-deletion)
      behind requireAdmin.
- [ ] Persistent storage (Drizzle / Postgres table) for the
      deletion request queue.
- [ ] Retention / anonymisation job that transitions
      pending -> processing -> completed with audit trail.
- [ ] E-mail confirmation to the requester at submit time.
- [ ] Hard-delete or anonymise the Supabase auth user record on
      completion (out of scope until retention rules are final).
- [ ] Webhook to Supabase Auth deleteUser if appropriate.
- [ ] Tests around the persistent path (regression: no
      cashback / order data is hard-deleted accidentally).

## 9. Outstanding work before real submission

- Final retention / anonymisation policy approved by counsel.
- Final copy for privacy / terms / cashback-terms approved by
  counsel.
- Demo accounts and store-review notes prepared.
- Screenshots in the required resolutions.
- Push notification copy and a permission rationale
  (when notifications are added).
- Deep link / App Link / Universal Link configuration
  (when the native shell lands).
- Re-audit this file every time a new tracking SDK, partner, or
  data category is introduced.
