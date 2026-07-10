# App Store Readiness -- Phase 20I.6

Internal planning document. NOT a submission plan. NOT a
checklist that, once ticked, makes the app eligible. Use this
file to track what is still required before any real submission
to Google Play or Apple App Store.

## Current status

The submission unit for Phase 20I.6 is the web foundation
served from Vaffiliate. There is no native app shell yet.

- [x] Public policy foundation
  - /privacy, /terms, /cashback-terms, /data-deletion
- [x] In-app account deletion request foundation
  - /app/account/delete (user), /app/admin/account-deletion (admin)
- [x] Route boundary (Phase 20I.5)
  - public / user / admin classification
  - role checks against trusted app metadata / custom claims only
- [x] Audit log foundation (Phase 20I.5)
  - typed AdminAction + emitter, no-op sink
- [ ] Final legal review of every policy page.
- [ ] Demo accounts for the store-review team.
- [ ] Screenshots in the store-required resolutions.
- [ ] Native app shell (Capacitor / React Native wrapper).
- [ ] Push notification copy + permission rationale.
- [ ] Deep link / App Link / Universal Link configuration.

## Required before CH Play submission

- [ ] All four public policy URLs reachable from the live
      production domain WITHOUT login.
- [ ] All four policy pages render the foundation note
      ("foundation, needs counsel review").
- [ ] A registered Data Safety form on Play Console reflecting
      docs/STORE_POLICY_FOUNDATION.md section 1.
- [ ] Demo account credentials handed to the Play review team.
- [ ] Privacy URL field on Play Console filled with
      https://<prod-domain>/privacy.
- [ ] Data deletion URL field on Play Console filled with
      https://<prod-domain>/data-deletion.
- [ ] No third-party tracking SDK present in the build
      (otherwise Data Safety answers change).

## Required before App Store submission

- [ ] All four public policy URLs reachable from the live
      production domain WITHOUT login.
- [ ] Privacy nutrition labels (App Privacy) on App Store Connect
      reflecting docs/STORE_POLICY_FOUNDATION.md section 1.
- [ ] App Tracking Transparency prompt: confirm the binary does
      NOT call ATTrackingManager.requestTrackingAuthorization
      until a tracking SDK is intentionally added.
- [ ] Demo account credentials handed to the App Review team.
- [ ] Review notes explaining the in-app deletion flow and where
      to find it.
- [ ] Sign-in flow must use WebAuthn / Sign in with Apple where
      applicable (this is policy-specific; verify with counsel).

## Required before EITHER submission

- [ ] Final review of every policy page by counsel.
- [ ] Retention / anonymisation policy approved.
- [ ] Demo accounts + review notes finalised.
- [ ] Screenshots in store-required resolutions.
- [ ] No real PII in any screenshot or demo account.
- [ ] No internal tokens / API keys / Supabase service role key
      in any build artifact.

## Important: do not advertise as ready

Until every checkbox in Required before CH Play submission,
Required before App Store submission AND
Required before EITHER submission is ticked, the project
MUST NOT advertise "ready to submit" or "100% eligible" in any
copy, blog post, or store metadata. The Phase 20I.6 brief
explicitly forbids such wording.

## How to use this doc

- Update the status section whenever a checkbox flips.
- Re-link this doc from PROJECT_STATE.md so future maintainers
  find it.
- Treat every unchecked box as a hard blocker for the
  corresponding store submission.
