# Vaffiliate Handoff

## 1. Document Purpose

This document is the operational handoff for the Vaffiliate repository.

Before starting any work, read:

1. `docs/PROJECT_STATE.md`
2. `docs/HANDOFF.md`

If these documents conflict:

- `PROJECT_STATE.md` is authoritative for roadmap and phase status.
- `HANDOFF.md` is authoritative for operational context, architecture constraints,
  verification history, and implementation notes.

Do not begin a new phase until the mandatory pre-phase workflow at the end of
this document has been completed.

---

## 2. Current Status

Project:
Vaffiliate

Architecture Version:
V2 Async Architecture

Current Phase:
Phase 19.5 Complete

Latest Remediation:
Phase 18 Consumer UX Remediation Complete

Current Stable Tag:
`phase-19.5-complete`

Stable Tag Commit:
`0afeb8b` — `phase19.5: tracking link generator cleanup and metrics foundation`

Last Verified Code Commit:
`30f50df` — `feat(phase-18): orders filter auto-scroll and updated docs`

Documentation Baseline Commit:
`2950c66` — `docs: reconcile Latest Verified Commit and Last Reconciled State`

Current Working Branch:
`feat/phase-18-consumer-ux`

Next Planned Phase:
Phase 20 — TBD, not started. Do not begin without approval.

Quality Gates:

- TypeScript: PASS — 0 errors
- ESLint: PASS — 0 errors, 0 warnings
- Diff check: PASS
- Production build: PASS
- Next.js generated pages: PASS — 30/30
- Manual responsive verification: PASS at 360, 390, 430, 768, and desktop widths

Route Summary:

- 21 route patterns total
- 15 static route patterns (`○`)
- 4 parameterized SSG route patterns (`●`)
- 2 dynamic route patterns (`ƒ`)

Important:
`30/30` is the number of generated page instances in the production build. It
is not the number of route patterns.

---

## 3. Current Architecture

Mandatory data flow:

```text
Page
→ Async Loader
→ Service
→ Repository
→ apiClient
→ mock-backend
→ mock domain slice
```

Global rules:

- Async-first architecture
- Server Component first
- No client-side data fetching
- No React Query
- No SWR
- No Redux
- No Zustand
- No Context-based data loading
- No direct repository access from pages
- No direct mock imports in pages or presentational components
- Presentational components receive data via props
- Joins and aggregations remain in the page layer
- Shopee and TikTok Shop only
- No generic affiliate-network abstraction layer
- Do not create duplicate data paths for read-only compositions

The legacy synchronous architecture has been removed. Do not reintroduce sync
hooks, sync service wrappers, sync repository methods, or page-level mock
imports.

---

## 4. Current Route Inventory

### Static Routes (`○`) — 15

- `/`
- `/_not-found`
- `/app`
- `/app/cashback`
- `/app/clicks`
- `/app/commission`
- `/app/conversions`
- `/app/finance`
- `/app/more`
- `/app/notifications`
- `/app/offers`
- `/app/profile`
- `/app/revenue`
- `/login`
- `/register`

### Parameterized SSG Routes (`●`) — 4

- `/app/campaigns/[campaignId]`
  - `cmp-shopee-q2`
  - `cmp-tiktok-launch`
- `/app/offers/[offerId]`
  - `off-shopee-fashion`
  - `off-shopee-beauty`
  - `off-tiktok-home`
- `/app/tracking-links/[trackingLinkId]`
  - `trk-001`
  - `trk-002`
  - `trk-003`
- `/app/tracking-links/generator/[offerId]`
  - `off-shopee-fashion`
  - `off-shopee-beauty`
  - `off-tiktok-home`

### Dynamic Routes (`ƒ`) — 2

- `/app/orders`
  - Dynamic because filter state is read from URL `searchParams`
- `/app/tracking-links`
  - Dynamic server-rendered route

Total:
21 route patterns.

Latest production build:
30/30 generated page instances.

---

## 5. Current Domains

### Dashboard

Status:
Complete

Chain:

```text
Page
→ loadDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend
```

Current consumer home includes:

- Consumer-focused hero
- Recent orders
- Popular offers
- Trust notice
- Shared primary navigation for desktop and mobile

`PopularOffer.rewardLabel` is a presentation label such as `8% hoàn tiền`.
It must not be treated as internal `networkCommission` data.

---

### Orders

Status:
Complete, including Phase 18 consumer UX remediation

Chain:

```text
Page
→ loadOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend
```

Canonical order statuses:

- `recorded`
- `reconciling`
- `approved`
- `rejected`
- `payable`
- `paid`

URL filter values:

- `all`
- `pending`
- `approved`
- `rejected`
- `payable`
- `paid`

Business mapping:

- `pending` matches `recorded` and `reconciling`
- Invalid URL values fall back to `all`
- Status parsing and matching live in `src/lib/filterUtils.ts`

Route behavior:

- Filter state is URL-driven through `?status=`
- The page passes `OrderStatusFilter` to `loadOrdersAsync`
- Filtering occurs through the repository path, not in a client fetch
- `loading.tsx` renders `OrdersLoadingState`
- `error.tsx` renders a consumer-friendly retry state using `reset()`

Empty states:

- Filtered empty state explains the selected filter and offers a link back to all
  orders
- Global empty state shows no reset button
- Filters remain visible in both states

Active filter behavior:

- Active chip DOM nodes are tracked with refs
- The active chip is centered in the horizontal filter container
- Centering uses a double `requestAnimationFrame`
- `ResizeObserver` re-centers after layout changes
- `router.push(..., { scroll: false })` preserves page scroll position

Manual verification completed:

- 360 px: PASS
- 390 px: PASS
- 430 px: PASS
- 768 px: PASS
- Desktop: PASS
- Filtered empty state: PASS
- Global empty state: PASS
- Active-chip auto-scroll: PASS
- No page-level horizontal overflow observed

---

### Finance

Status:
Complete

Chain:

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

Status:
Complete

Purpose:

- More menu
- Navigation items

Important:
User is not the identity/profile domain.

Chain:

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

Status:
Complete

Chain:

```text
Page
→ loadAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend
```

Affiliate is the single source of truth for:

- Advertisers
- Campaigns
- Offers
- Tracking links
- Conversions
- Revenue compositions
- Commission compositions

Do not create standalone domains or duplicate loaders for:

- Conversion analytics
- Revenue analytics
- Commission analytics

Do not create:

- `loadConversionAsync`
- `loadRevenueAsync`
- `loadCommissionAsync`

Those features remain page-level compositions over Affiliate data.

#### Affiliate Use-Case DTOs

`AffiliateData` contains the shared list payload only:

- advertisers
- campaigns
- offers
- tracking links
- conversions
- joined offer IDs
- publisher profile
- tracking-link statistics

Use-case-specific data is loaded separately:

- `loadTrackingLinkGeneratorContextAsync(offerId)` returns
  `TrackingLinkGeneratorData`
- `loadOfferDetailContextAsync(offerId)` returns `OfferDetailData`

The loader/service/repository function names retain the `Context` suffix, while
the return DTOs are owned by `src/types/affiliate.ts` and use the `Data` suffix.

Fallible repository/service operations use the discriminated `ApiResult<T>`
contract from `src/types/api.ts`.

Unsafe dummy casts such as `null as unknown as ...` have been removed.

Existing tracking links preserve their persisted `destinationUrl`. Preview and
new-link flows may use the offer default destination URL.

---

### Cashback

Status:
Complete

Chain:

```text
Page
→ loadCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend
```

Cashback includes history, statistics, filters, and generator behavior.

---

### Notification

Status:
Complete

Chain:

```text
Page
→ loadNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend
```

Notification includes foundation, center UI, statistics, filters, and list.

---

### Click

Status:
Complete

Click is a standalone domain.

Chain:

```text
Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend
```

Primary route:
`/app/clicks`

---

### Profile

Status:
Complete through Phase 16C

Profile is a standalone domain. It is not part of User.

Ownership:

- User owns More-menu navigation items
- Profile owns identity, avatar URL rendering, contact information, member
  tier, preferred platforms, and payout account

Chain:

```text
Page (/app/profile)
→ loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository.getProfileDataAsync
→ apiClient
→ mock-backend
```

Current UI:

- `ProfileHeader`
- `ProfileInfoCard`
- `PayoutAccountCard`
- `ProfileStatsCard`
- `ProfileManagementPanel`

Current behavior:

- `avatarUrl` is rendered when present
- Initials are used as a fallback
- Personal information can be edited in the mock workflow
- Payout-account information can be edited in the mock workflow
- `/app/more` includes a link to `/app/profile`
- Mock persistence is held in `src/lib/mock/profile-store.ts`

Edit chain:

```text
ProfileManagementPanel
→ profile edit service
→ profile edit repository
→ apiClient
→ mock-backend
→ mutable mock profile store
```

Deferred:

- Real backend persistence
- Avatar upload
- Withdrawal workflow
- Membership management
- Referral system
- Settings center

---

### Campaign Detail

Status:
Complete

Campaign Detail is part of Affiliate, not a separate domain.

Chain:

```text
Page (/app/campaigns/[campaignId])
→ loadCampaignDetailAsync
→ campaignDetailService
→ campaignDetailRepository
→ apiClient
→ mock-backend
→ campaignDetails[campaignId]
```

Endpoints:

- `/campaign/detail/:campaignId`
- `/campaign/statistics/:campaignId`

Route:

- `/app/campaigns/[campaignId]`
- Parameterized SSG through `generateStaticParams`
- Pre-rendered for `cmp-shopee-q2` and `cmp-tiktok-launch`

UI components:

- `CampaignHeader`
- `CampaignCommissionCard`
- `CampaignTrackingCard`
- `CampaignStatsGrid`
- `CampaignNotFound`

Drill-down:

- Offer table campaign names link to Campaign Detail
- Tracking-link table campaign names link to Campaign Detail
- No top-level navigation entry

Mock backend routing supports exact-match handlers and parameterized prefix
handlers. Existing exact endpoints retain their behavior.

Deferred:

- Campaign CRUD
- Campaign-level analytics filters
- Per-campaign offer, link, and conversion lists
- Campaign write actions

---

## 6. Analytics Architecture and Business Rules

### Domain Ownership

Click is a standalone domain.

Conversion analytics is not a standalone domain.

Revenue analytics is not a standalone domain.

Commission analytics is not a standalone domain.

Conversion, Revenue, and Commission are page-level Affiliate compositions.

Keep joins, maps, and aggregations inside the relevant `page.tsx` files.
Only pure stateless formatting and parsing helpers belong in shared utilities.

### Shared Analytics Helpers

The following helpers live in `src/lib/analytics/format.ts`:

- `formatVnd`
- `formatDate`
- `parseRate`
- `parseOrderValue`
- `supportedPlatforms`
- `isApprovedStatus`

### Approved-Bucket Rule

`paid` is treated as approved for analytics reconciliation.

The canonical predicate is `isApprovedStatus(status)`.

Commission reconciliation must satisfy:

```text
approved + pending + rejected = total
```

This rule applies consistently across conversions, commission, and cashback.

---

## 7. Phase History and Important Decisions

### Phase 15E — Architecture Stabilization

Status:
Complete

Delivered:

- Landing route migrated to `loadDashboardAsync`
- Legacy sync route path removed
- Async loaders renamed from `useXAsync` to `loadXAsync`
- Shared analytics helpers extracted
- `paid` normalized into approved analytics buckets
- Sync hooks, sync service wrappers, sync repository methods, and orphaned
  repository mock imports deleted

Historical note:
At the time of Phase 15E, all then-existing routes used the async path. The
current repository has 21 route patterns and continues to use the same
architecture.

---

### Phase 16A, 16B, and 16C — Profile

Status:
Complete

Delivered:

- Standalone Profile data domain
- Profile route and presentational UI
- Avatar URL rendering with initials fallback
- Personal-information and payout-account mock editing
- Profile navigation from `/app/more`

---

### Phase 17 — Campaign Detail

Status:
Complete

Delivered:

- Campaign detail loader/service/repository chain
- Parameterized campaign endpoints
- Two SSG campaign fixtures
- Presentational campaign detail UI
- Drill-down from offers and tracking links
- Orphaned duplicate campaign-detail mock removed

Stable tag:
`phase-17-complete`

---

### Phase 18 — Offer Detail Delivery

Status:
Complete

Stable tag:
`phase-18-complete`

Tag commit:
`021ce4e` — `phase18: offer detail drill-down`

Important:
This product-delivery phase is separate from the later Phase 18 Consumer UX
Remediation work performed on the current feature branch.

---

### Phase 18 Consumer UX Remediation

Status:
Complete

Branch:
`feat/phase-18-consumer-ux`

Delivered:

- Consumer-focused dashboard and primary navigation
- URL-driven Orders filters
- Canonical Orders status model
- Invalid filter fallback
- Orders loading and error boundaries
- Filtered and global empty states
- Active filter chip auto-scroll and centering
- Responsive verification across mobile, tablet, and desktop widths
- Affiliate use-case DTO ownership correction
- Discriminated `ApiResult<T>` adoption for fallible operations
- Unsafe dummy result casts removed
- `PopularOffer.rewardLabel` presentation semantics
- No direct mock imports in pages or features

Key code commits:

- `b360e07` — `wip(phase-18): stabilize orders flow and type contracts`
- `30f50df` — `feat(phase-18): orders filter auto-scroll and updated docs`

No remediation-specific stable tag exists. Do not invent or create one unless explicitly approved.

---

### Phase 19 and 19.5 — Tracking Links Generator

Status:
Complete

Stable tag:
`phase-19.5-complete`

Tag commit:
`0afeb8b` — `phase19.5: tracking link generator cleanup and metrics foundation`

Delivered:

- Workflow route renamed from `/create` to `/generator`
- Feature folder renamed to `tracking-links/generator`
- `TrackingLinkCreateNotFound` renamed to
  `TrackingLinkGeneratorNotFound`
- AOV fixtures reset to `0` where no real aggregate exists
- AOV removed from `TrackingLinkAttributionCard` rendering
- `TrackingLinkMetrics.aov` retained in the type for future Phase 20 work

No new data path was introduced.

Deferred to Phase 20:
Real AOV aggregate calculation.

---

## 8. Current Stable Tags

Relevant confirmed stable tags:

- `architecture-v2-stable`
- `phase-11-stable`
- `phase-14A-stable`
- `phase-14B-foundation-stable`
- `phase-14B-ui-stable`
- `phase-14B-complete`
- `phase-15D-complete`
- `phase-15E-complete`
- `phase-16A-complete`
- `phase-16B-complete`
- `phase-16C-complete`
- `phase-17-complete`
- `phase-18-complete`
- `phase-19.5-complete`

Current latest stable tag:
`phase-19.5-complete`

Do not document any remediation-specific stable tag unless it has actually been created and approved.

---

## 9. Repository Health

Verified on branch `feat/phase-18-consumer-ux`:

```text
npx tsc --noEmit
Exit code: 0
```

```text
npx eslint src --max-warnings=0
Exit code: 0
```

```text
git --no-pager diff --check HEAD
Exit code: 0
```

```text
npm run build
Exit code: 0
```

Build details:

- Next.js 16.2.9 with Turbopack
- Compilation: PASS
- TypeScript build stage: PASS
- Page-data collection: PASS
- Static generation: PASS — 30/30 generated page instances
- Route classification: 15 static, 4 SSG, 2 dynamic

Architecture health:

- Single async data path: PASS
- No legacy sync path: PASS
- No React Query/SWR/Redux/Zustand data layer: PASS
- No Context-based data loading: PASS
- No direct page/component mock imports: PASS
- Server-first route composition: PASS

Known architecture debt from the deleted sync path:
None.

---

## 10. Known Deferred Work

Phase 20 candidate work:

- Real tracking-link AOV aggregate calculation

Other deferred work:

- Real backend persistence
- Authentication hardening
- Profile avatar upload
- Withdrawal workflow
- Membership and referral features
- Campaign CRUD and write actions
- Campaign-level analytics filters
- Per-campaign entity lists

Do not implement deferred work without phase approval.

---

## 11. Mandatory Workflow Before Any New Phase

1. Read `docs/PROJECT_STATE.md`
2. Read `docs/HANDOFF.md`
3. Verify the current branch
4. Verify the latest commit
5. Verify stable tags and the tag ancestry
6. Run TypeScript
7. Run ESLint with zero warnings
8. Run diff check
9. Run the production build
10. Audit the current architecture and affected domain chain
11. Produce analysis only
12. Wait for explicit approval before coding

Never start coding immediately.

Never create files before approval.

Never bypass the architecture analysis.

Never invent a phase-completion tag.

---

## 12. Merge Readiness Checklist

Before merging the current branch:

- [ ] `docs/PROJECT_STATE.md` and `docs/HANDOFF.md` agree
- [ ] Current phase is documented as Phase 19.5 Complete
- [ ] Phase 18 Consumer UX Remediation is recorded as remediation, not the
      current roadmap phase
- [ ] Latest stable tag is `phase-19.5-complete`
- [ ] No nonexistent or unapproved stable tag is documented
- [ ] Route count is documented as 21 route patterns
- [ ] Build count is documented as 30/30 generated page instances
- [ ] TypeScript passes
- [ ] ESLint passes with zero warnings
- [ ] Diff check passes
- [ ] Production build passes
- [ ] Manual Orders responsive checks remain valid
- [ ] Working tree is clean
- [ ] Branch diff against `main` or `origin/main` is reviewed

Recommended branch-diff checks:

```text
git merge-base --is-ancestor origin/main HEAD
git log --oneline origin/main..HEAD
git diff --name-status origin/main..HEAD
git diff --stat origin/main..HEAD
```

---

## 13. Last Reconciled State

Roadmap phase:
Phase 19.5 Complete

Latest remediation:
Phase 18 Consumer UX Remediation Complete

Latest stable tag:
`phase-19.5-complete`

Last verified code commit:
`30f50df`

Documentation baseline commit before this rewrite:
`2950c66`

Production verification:

- TypeScript: PASS
- ESLint: PASS — 0 errors, 0 warnings
- Diff check: PASS
- Build: PASS
- Generated pages: 30/30
- Route patterns: 21
- Orders responsive and empty-state verification: PASS

Next planned phase:
Phase 20 — not started. Approval required.
