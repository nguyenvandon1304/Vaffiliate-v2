# Vaffiliate Handoff

## 1. Document Purpose

This document is the operational handoff for the Vaffiliate repository.

Before starting any work, read:

1. `docs/PROJECT_STATE.md`
2. `docs/HANDOFF.md`

If these documents conflict:

* `docs/PROJECT_STATE.md` is authoritative for roadmap and phase status.
* `docs/HANDOFF.md` is authoritative for operational context, architecture
  constraints, implementation decisions, verification history, and handoff
  instructions.
* Git history, existing tags, source code, and verified build output take
  precedence over stale documentation when factual discrepancies are found.

Do not begin a new phase until the mandatory pre-phase workflow in section 12
has been completed.

---

## 2. Current Status

**Project:** Vaffiliate

**Architecture Version:** V2 Async Architecture

**Current Roadmap Phase:** Phase 19.5 Complete

**Latest Remediation:** Phase 18 Consumer UX Remediation Complete

**Current Stable Tag:** `phase-19.5-complete`

**Stable Tag Commit:** `0afeb8b` —
`phase19.5: tracking link generator cleanup and metrics foundation`

**Last Verified Code Commit:** `30f50df` —
`feat(phase-18): orders filter auto-scroll and updated docs`

**Current Working Branch:** `feat/phase-18-consumer-ux`

**Next Planned Phase:** Phase 20 — TBD, not started. Do not begin without
explicit approval.

### Quality Gates

* TypeScript: PASS — 0 errors
* ESLint: PASS — 0 errors, 0 warnings
* Diff check: PASS
* Production build: PASS
* Generated page instances: PASS — 30/30
* Manual responsive verification: PASS at 360, 390, 430, 768, and desktop
  widths

### Route Summary

* 21 route patterns total
* 15 static route patterns (`○`)
* 4 parameterized SSG route patterns (`●`)
* 2 dynamic route patterns (`ƒ`)

> **Important:** `30/30` is the number of generated page instances produced by
> the Next.js production build. It is not the number of route patterns.

---

## 3. Source of Truth

`docs/PROJECT_STATE.md` is authoritative for:

* roadmap status;
* current and completed phases;
* latest stable tag;
* route inventory;
* planned future work.

`docs/HANDOFF.md` is authoritative for:

* operational context;
* architecture constraints;
* implementation decisions;
* verification history;
* repository handoff instructions.

When reconciling documentation, verify facts against:

```text
git branch --show-current
git log --oneline --decorate
git tag --list
git merge-base --is-ancestor <tag-or-branch> HEAD
```

Build and route facts must be taken from a verified production build rather
than inferred from the source tree.

---

## 4. Current Architecture

### Mandatory Data Flow

```text
Page
→ Async Loader
→ Service
→ Repository
→ apiClient
→ mock-backend
→ mock domain slice
```

### Global Rules

* Async-first architecture
* Server Component first
* No client-side data fetching for domain data
* No React Query
* No SWR
* No Redux
* No Zustand
* No Context-based data loading
* No direct repository access from pages
* No direct mock imports in pages or presentational components
* Presentational components receive data through props
* Joins and aggregations remain in the page layer
* Pure, stateless parsing and formatting helpers may live in shared utilities
* Shopee and TikTok Shop only
* No generic affiliate-network abstraction layer
* Do not create duplicate data paths for read-only compositions

The legacy synchronous architecture has been removed.

Do not reintroduce:

* synchronous data hooks;
* synchronous service wrappers;
* synchronous repository methods;
* page-level mock imports;
* component-level domain data loading;
* parallel data paths for the same domain payload.

### Loader Naming

Functions named `loadXAsync` are server-side async loaders.

They are not React hooks, even when historical project organization places
their files under `src/hooks`.

A loader must not be described as a React hook unless it actually uses React
hook semantics and follows the `useX` convention.

---

## 5. Current Route Inventory

### Static Routes (`○`) — 15

* `/`
* `/_not-found`
* `/app`
* `/app/cashback`
* `/app/clicks`
* `/app/commission`
* `/app/conversions`
* `/app/finance`
* `/app/more`
* `/app/notifications`
* `/app/offers`
* `/app/profile`
* `/app/revenue`
* `/login`
* `/register`

### Parameterized SSG Routes (`●`) — 4

#### `/app/campaigns/[campaignId]`

Pre-rendered parameters:

* `cmp-shopee-q2`
* `cmp-tiktok-launch`

#### `/app/offers/[offerId]`

Pre-rendered parameters:

* `off-shopee-fashion`
* `off-shopee-beauty`
* `off-tiktok-home`

#### `/app/tracking-links/[trackingLinkId]`

Pre-rendered parameters:

* `trk-001`
* `trk-002`
* `trk-003`

#### `/app/tracking-links/generator/[offerId]`

Pre-rendered parameters:

* `off-shopee-fashion`
* `off-shopee-beauty`
* `off-tiktok-home`

### Dynamic Routes (`ƒ`) — 2

#### `/app/orders`

Dynamic because filter state is read from URL `searchParams`.

#### `/app/tracking-links`

Dynamic server-rendered route.

### Route Totals

```text
15 static route patterns
4 parameterized SSG route patterns
2 dynamic route patterns
21 route patterns total
```

Latest verified production build:

```text
30/30 generated page instances
```

---

## 6. Current Domains

### Dashboard

**Status:** Complete

**Data chain:**

```text
Page
→ loadDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend
```

Current consumer home includes:

* consumer-focused hero;
* recent orders;
* popular offers;
* trust notice;
* shared primary navigation for desktop and mobile.

`PopularOffer.rewardLabel` is a presentation label such as `8% hoàn tiền`.

It must not be interpreted as internal `networkCommission` data.

---

### Orders

**Status:** Complete, including Phase 18 Consumer UX Remediation

**Data chain:**

```text
Page
→ loadOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend
```

#### Canonical Order Statuses

* `recorded`
* `reconciling`
* `approved`
* `rejected`
* `payable`
* `paid`

#### URL Filter Values

* `all`
* `pending`
* `approved`
* `rejected`
* `payable`
* `paid`

#### Filter Mapping

* `pending` matches `recorded` and `reconciling`
* Invalid URL values fall back to `all`
* Status parsing and matching live in `src/lib/filterUtils.ts`

#### Route Behavior

* Filter state is URL-driven through `?status=`
* The page resolves a validated `OrderStatusFilter`
* The page passes the validated filter to `loadOrdersAsync`
* Filtering follows the loader, service, and repository path
* No client-side fetch is introduced
* Existing query parameters are preserved when filters change
* `router.push(..., { scroll: false })` preserves page scroll position

#### Route Boundaries

* `loading.tsx` renders `OrdersLoadingState`
* `error.tsx` renders a consumer-friendly retry state
* The error boundary uses `reset()` for retry behavior

#### Empty States

Filtered empty state:

* explains the selected filter;
* keeps the filter controls visible;
* provides a route back to all orders.

Global empty state:

* explains that no orders exist;
* keeps the filter controls visible;
* does not show a redundant reset action.

#### Active Filter Chip Behavior

* Active chip DOM nodes are tracked with refs
* The active chip is centered inside the horizontal filter container
* Centering uses a double `requestAnimationFrame`
* `ResizeObserver` re-centers the chip after layout changes
* The implementation avoids page-level horizontal overflow

#### Manual Verification

* 360 px: PASS
* 390 px: PASS
* 430 px: PASS
* 768 px: PASS
* Desktop: PASS
* Filtered empty state: PASS
* Global empty state: PASS
* Active-filter auto-scroll: PASS
* Page-level horizontal overflow: not observed

---

### Finance

**Status:** Complete

**Data chain:**

```text
Page
→ loadFinanceAsync
→ financeService
→ financeRepository
→ apiClient
→ mock-backend
```

Finance remains a standalone domain for summary and transaction history.

---

### User

**Status:** Complete

**Purpose:**

* More-menu navigation items
* Shared user-facing navigation data

User is not the identity or profile domain.

**Data chain:**

```text
Page
→ loadUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend
```

---

### Affiliate

**Status:** Complete

**Primary data chain:**

```text
Page
→ loadAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend
```

Affiliate is the single source of truth for:

* advertisers;
* campaigns;
* offers;
* tracking links;
* conversions;
* revenue compositions;
* commission compositions.

Do not create standalone domains or duplicate data loaders for:

* conversion analytics;
* revenue analytics;
* commission analytics.

Do not create:

* `loadConversionAsync`
* `loadRevenueAsync`
* `loadCommissionAsync`

Conversions, Revenue, and Commission remain page-level compositions over
Affiliate data.

#### Affiliate Shared Payload

`AffiliateData` contains the shared list payload:

* advertisers;
* campaigns;
* offers;
* tracking links;
* conversions;
* joined offer IDs;
* publisher profile;
* tracking-link statistics.

#### Affiliate Use-Case DTOs

Tracking-link generator data is loaded through:

```text
loadTrackingLinkGeneratorContextAsync(offerId)
→ TrackingLinkGeneratorData
```

Offer-detail data is loaded through:

```text
loadOfferDetailContextAsync(offerId)
→ OfferDetailData
```

The loader, service, and repository function names may retain the `Context`
suffix.

The return DTOs are owned by `src/types/affiliate.ts` and use the `Data`
suffix.

Correct DTO names:

* `AffiliateData`
* `TrackingLinkGeneratorData`
* `OfferDetailData`

Do not reintroduce context-shaped DTO aliases. Return DTOs must remain owned by
`src/types/affiliate.ts` and retain the `Data` suffix.

#### API Results

Fallible repository and service operations use the discriminated
`ApiResult<T>` contract from `src/types/api.ts`.

Unsafe placeholder casts such as:

```text
null as unknown as ...
```

have been removed and must not be reintroduced.

#### Tracking-Link Destination URLs

Existing tracking links preserve their persisted `destinationUrl`.

Preview and new-link workflows may use the offer default destination URL.

The default destination URL must not silently overwrite a persisted URL on an
existing tracking link.

---

### Cashback

**Status:** Complete

**Data chain:**

```text
Page
→ loadCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend
```

Cashback includes:

* history;
* statistics;
* platform filters;
* cashback presentation behavior.

---

### Notification

**Status:** Complete

**Data chain:**

```text
Page
→ loadNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend
```

Notification includes:

* notification center UI;
* statistics;
* filtering;
* notification list behavior.

---

### Click

**Status:** Complete

Click is a standalone domain.

**Data chain:**

```text
Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend
```

**Primary route:** `/app/clicks`

---

### Profile

**Status:** Complete through Phase 16C — foundation, UI, management, and
navigation

Profile is a standalone domain.

Profile is not part of User.

#### Ownership

User owns:

* More-menu navigation items;
* navigation data.

Profile owns:

* identity;
* avatar URL rendering;
* contact information;
* member tier;
* preferred platforms;
* payout account.

#### Data Chain

```text
Page (/app/profile)
→ loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository.getProfileDataAsync
→ apiClient
→ mock-backend
```

`loadProfileAsync` is a server-side async loader.

It currently lives under `src/hooks` because of historical project
organization, but it is not a React hook.

The page calls the loader and does not access the repository directly.

#### Current UI Components

* `ProfileHeader`
* `ProfileInfoCard`
* `PayoutAccountCard`
* `ProfileStatsCard`
* `ProfileManagementPanel`

#### Current Behavior

* `avatarUrl` is rendered when present
* Initials are used as a fallback
* Personal information can be edited in the mock workflow
* Payout-account information can be edited in the mock workflow
* `/app/more` includes a link to `/app/profile`
* Mock persistence is held in `src/lib/mock/profile-store.ts`

#### Edit Chain

```text
ProfileManagementPanel
→ profile edit service
→ profile edit repository
→ apiClient
→ mock-backend
→ mutable mock profile store
```

#### Deferred

* Real backend persistence
* Avatar upload
* Withdrawal workflow
* Membership management
* Referral system
* Settings center

Completed Profile behavior must not be documented as deferred.

---

### Campaign Detail

**Status:** Complete

Campaign Detail belongs to Affiliate.

It is not a standalone domain.

#### Data Chain

```text
Page (/app/campaigns/[campaignId])
→ loadCampaignDetailAsync
→ campaignDetailService
→ campaignDetailRepository
→ apiClient
→ mock-backend
→ campaignDetails[campaignId]
```

#### Endpoints

* `/campaign/detail/:campaignId`
* `/campaign/statistics/:campaignId`

#### Route

```text
/app/campaigns/[campaignId]
```

The route is parameterized SSG through `generateStaticParams`.

Pre-rendered campaign IDs:

* `cmp-shopee-q2`
* `cmp-tiktok-launch`

#### UI Components

* `CampaignHeader`
* `CampaignCommissionCard`
* `CampaignTrackingCard`
* `CampaignStatsGrid`
* `CampaignNotFound`

#### Drill-Down

* Offer-table campaign names link to Campaign Detail
* Tracking-link-table campaign names link to Campaign Detail
* No top-level navigation entry is added

#### Mock Backend Routing

The mock backend supports:

* exact-match handlers;
* parameterized prefix handlers.

Existing exact endpoints retain their behavior.

Unknown campaign IDs resolve through the not-found presentation flow.

#### Deferred

* Campaign CRUD
* Campaign-level analytics filters
* Per-campaign offer, tracking-link, and conversion lists
* Campaign write actions

---

## 7. Analytics Architecture and Business Rules

### Domain Ownership

Click is a standalone domain.

The following analytics features are not standalone domains:

* Conversion analytics
* Revenue analytics
* Commission analytics

Conversions, Revenue, and Commission remain page-level Affiliate
compositions.

Do not split them into separate repositories, services, or loaders.

### Aggregation Location

Keep joins, maps, and domain aggregations inside the relevant `page.tsx`
files.

Only pure, stateless parsing and formatting helpers belong in shared utility
modules.

### Shared Analytics Helpers

The following helpers live in `src/lib/analytics/format.ts`:

* `formatVnd`
* `formatDate`
* `parseRate`
* `parseOrderValue`
* `supportedPlatforms`
* `isApprovedStatus`

### Approved-Bucket Rule

`paid` is treated as approved for analytics reconciliation.

The canonical predicate is:

```text
isApprovedStatus(status)
```

Commission reconciliation must satisfy:

```text
approved + pending + rejected = total
```

This rule applies consistently across:

* conversions;
* commission;
* cashback.

### Commission Presentation Decisions

Highest Commission Offer was removed because no valid drill-down destination
exists.

Highest Commission Campaign remains because it is backed by the campaign
table and Campaign Detail route.

Commission top-link presentation includes:

* tracking code;
* platform;
* commission;
* conversions.

It does not display `avgCommission` because no valid click denominator exists.

---

## 8. Phase History and Important Decisions

### Phase 15E — Architecture Stabilization

**Status:** Complete

Delivered:

* Landing route migrated to `loadDashboardAsync`
* Legacy synchronous route path removed
* Async loaders renamed from `useXAsync` to `loadXAsync`
* Shared analytics helpers extracted
* `paid` normalized into approved analytics buckets
* Synchronous hooks removed
* Synchronous service wrappers removed
* Synchronous repository methods removed
* Orphaned repository mock imports removed

The `loadXAsync` functions are server-side async loaders, not React hooks.

At the time of Phase 15E, all then-existing routes used the async path.

The current repository has 21 route patterns and continues to use the same
architecture.

---

### Phase 16A, 16B, and 16C — Profile

**Status:** Complete

Delivered:

* Standalone Profile data domain
* Profile route and presentational UI
* Avatar URL rendering with initials fallback
* Personal-information mock editing
* Payout-account mock editing
* Profile navigation from `/app/more`
* Mutable mock persistence for Profile management flows

Deferred items remain documented in the Profile domain section.

---

### Phase 17 — Campaign Detail

**Status:** Complete

**Stable Tag:** `phase-17-complete`

Delivered:

* Campaign-detail loader, service, and repository chain
* Parameterized campaign endpoints
* Two SSG campaign fixtures
* Presentational Campaign Detail UI
* Drill-down from Offers and Tracking Links
* Orphaned duplicate campaign-detail mock removed

Campaign Detail remains part of Affiliate and must not become a duplicate
standalone data domain.

---

### Phase 18 — Offer Detail Delivery

**Status:** Complete

**Stable Tag:** `phase-18-complete`

**Tag Commit:** `021ce4e` — `phase18: offer detail drill-down`

This product-delivery phase is separate from the later Phase 18 Consumer UX
Remediation work.

The shared phase number does not imply that the remediation has its own stable
tag.

---

### Phase 18 Consumer UX Remediation

**Status:** Complete

**Branch:** `feat/phase-18-consumer-ux`

Delivered:

* Consumer-focused dashboard
* Shared desktop and mobile primary navigation
* URL-driven Orders filters
* Canonical Orders status model
* Invalid filter fallback
* Orders loading boundary
* Orders error boundary
* Filtered empty state
* Global empty state
* Active-filter chip auto-scroll and centering
* Responsive verification across mobile, tablet, and desktop widths
* Affiliate use-case DTO ownership correction
* Discriminated `ApiResult<T>` adoption for fallible operations
* Unsafe placeholder result casts removed
* `PopularOffer.rewardLabel` presentation semantics documented
* No direct mock imports added to pages or features

Key code commits:

* `b360e07` —
  `wip(phase-18): stabilize orders flow and type contracts`
* `30f50df` —
  `feat(phase-18): orders filter auto-scroll and updated docs`

No remediation-specific stable tag exists.

Do not invent or create any remediation-specific stable tag unless explicitly
approved.

---

### Phase 19 and 19.5 — Tracking Links Generator

**Status:** Complete

**Stable Tag:** `phase-19.5-complete`

**Tag Commit:** `0afeb8b` —
`phase19.5: tracking link generator cleanup and metrics foundation`

Delivered:

* Workflow route renamed from `/create` to `/generator`
* Feature folder renamed to `tracking-links/generator`
* `TrackingLinkCreateNotFound` renamed to
  `TrackingLinkGeneratorNotFound`
* AOV fixtures reset to `0` where no real aggregate exists
* AOV removed from `TrackingLinkAttributionCard` rendering
* `TrackingLinkMetrics.aov` retained in the type for future aggregate work

No new data path was introduced.

The workflow reuses the Affiliate architecture.

Deferred to Phase 20:

* real tracking-link AOV aggregate calculation.

---

## 9. Current Stable Tags

Relevant confirmed stable tags:

* `architecture-v2-stable`
* `phase-11-stable`
* `phase-14A-stable`
* `phase-14B-foundation-stable`
* `phase-14B-ui-stable`
* `phase-14B-complete`
* `phase-15D-complete`
* `phase-15E-complete`
* `phase-16A-complete`
* `phase-16B-complete`
* `phase-16C-complete`
* `phase-17-complete`
* `phase-18-complete`
* `phase-19.5-complete`

**Latest stable tag:** `phase-19.5-complete`

**Latest stable tag commit:** `0afeb8b`

Do not document a remediation-specific stable tag unless it has actually been
created and explicitly approved.

---

## 10. Repository Health

Verified on branch:

```text
feat/phase-18-consumer-ux
```

### Verified Commands

| Check            | Command                            | Result        |
| ---------------- | ---------------------------------- | ------------- |
| TypeScript       | `npx tsc --noEmit`                 | PASS — exit 0 |
| ESLint           | `npx eslint src --max-warnings=0`  | PASS — exit 0 |
| Diff check       | `git --no-pager diff --check HEAD` | PASS — exit 0 |
| Production build | `npm run build`                    | PASS — exit 0 |

### Build Details

* Next.js 16.2.9 with Turbopack
* Compilation: PASS
* TypeScript build stage: PASS
* Page-data collection: PASS
* Static generation: PASS — 30/30 generated page instances
* Route classification: 15 static, 4 parameterized SSG, 2 dynamic

### Architecture Health

* Single async data path: PASS
* No legacy synchronous path: PASS
* No React Query data layer: PASS
* No SWR data layer: PASS
* No Redux data layer: PASS
* No Zustand data layer: PASS
* No Context-based domain data loading: PASS
* No direct page or component mock imports: PASS
* Server-first route composition: PASS
* Page-layer joins and aggregations: PASS

### Branch Relationship

The feature branch was verified to contain the fetched `origin/main` history:

```text
git merge-base --is-ancestor origin/main HEAD
Exit code: 0
```

The branch was pushed successfully to:

```text
origin/feat/phase-18-consumer-ux
```

A pushed branch is not the same as a merged branch.

The Pull Request must still be reviewed and merged on GitHub.

### Known Architecture Debt

No remaining debt from the deleted synchronous architecture has been
identified.

---

## 11. Known Deferred Work

### Phase 20 Candidate Work

* Real tracking-link AOV aggregate calculation

### Other Deferred Work

* Real backend persistence
* Authentication hardening
* Profile avatar upload
* Withdrawal workflow
* Membership management
* Referral system
* Settings center
* Campaign CRUD
* Campaign write actions
* Campaign-level analytics filters
* Per-campaign entity lists

Do not implement deferred work without phase approval.

Do not mark Phase 20 as started until implementation has been explicitly
approved.

---

## 12. Mandatory Workflow Before Any New Phase

1. Read `docs/PROJECT_STATE.md`
2. Read `docs/HANDOFF.md`
3. Verify the current branch
4. Verify the latest commit
5. Verify existing stable tags
6. Verify stable-tag ancestry
7. Run TypeScript with zero errors
8. Run ESLint with zero warnings
9. Run diff check
10. Run the production build
11. Audit the affected domain architecture
12. Confirm the mandatory data chain remains intact
13. Produce analysis before implementation
14. Wait for explicit approval before modifying implementation files

Never start coding immediately.

Never create implementation files before approval.

Never bypass architecture analysis.

Never invent a phase-completion tag.

Never use destructive Git recovery commands unless explicitly approved and
fully understood.

---

## 13. Merge Readiness Checklist

Before merging the current branch:

* [ ] `docs/PROJECT_STATE.md` and `docs/HANDOFF.md` agree
* [ ] Current roadmap phase is documented as Phase 19.5 Complete
* [ ] Phase 18 Consumer UX Remediation is documented as remediation
* [ ] Remediation is not documented as the current roadmap phase
* [ ] Latest stable tag is `phase-19.5-complete`
* [ ] Stable tag commit is `0afeb8b`
* [ ] No nonexistent or unapproved stable tag is documented
* [ ] Route count is documented as 21 route patterns
* [ ] Route split is documented as 15 static, 4 SSG, and 2 dynamic
* [ ] Build count is documented as 30/30 generated page instances
* [ ] `30/30` is not described as the route count
* [ ] TypeScript passes
* [ ] ESLint passes with zero warnings
* [ ] Diff check passes
* [ ] Production build passes
* [ ] Manual Orders responsive checks remain valid
* [ ] Orders filtered empty state remains valid
* [ ] Orders global empty state remains valid
* [ ] Orders active-filter auto-scroll remains valid
* [ ] Working tree contains only intentional changes
* [ ] Branch diff against `origin/main` is reviewed
* [ ] Pull Request file list is reviewed
* [ ] Pull Request checks, when configured, pass
* [ ] Pull Request is merged before the branch is deleted

Recommended branch-diff checks:

```text
git merge-base --is-ancestor origin/main HEAD
git log --oneline origin/main..HEAD
git diff --name-status origin/main..HEAD
git diff --stat origin/main..HEAD
```

Recommended documentation checks:

```text
git diff --check
git status --short
git diff -- docs/HANDOFF.md
```

---

## 14. Last Reconciled State

**Roadmap Phase:** Phase 19.5 Complete

**Latest Remediation:** Phase 18 Consumer UX Remediation Complete

**Latest Stable Tag:** `phase-19.5-complete`

**Stable Tag Commit:** `0afeb8b`

**Last Verified Code Commit:** `30f50df`

**Current Working Branch:** `feat/phase-18-consumer-ux`

### Production Verification

* TypeScript: PASS — 0 errors
* ESLint: PASS — 0 errors, 0 warnings
* Diff check: PASS
* Production build: PASS
* Generated page instances: 30/30
* Route patterns: 21

  * 15 static
  * 4 parameterized SSG
  * 2 dynamic
* Orders responsive verification: PASS
* Orders filtered empty state: PASS
* Orders global empty state: PASS
* Orders active-filter auto-scroll: PASS

### Current Merge State

The feature branch has been pushed to GitHub.

The Pull Request has been created.

The Pull Request is not considered merged until GitHub shows the final
`Merged` state.

### Next Planned Phase

Phase 20 is not started.

Explicit approval is required before implementation begins.
