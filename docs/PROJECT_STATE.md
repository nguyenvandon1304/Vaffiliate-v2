# Vaffiliate Project State

## Current Status

Project:
Vaffiliate

Architecture Version:
V2 Async Architecture

Current Phase:
Phase 19.5 Complete

Latest Remediation:
Phase 18 Consumer UX Remediation Complete

Last Stable Tag:
`phase-19.5-complete`

Stable Tag Commit:
`0afeb8b` — `phase19.5: tracking link generator cleanup and metrics foundation`

Last Verified Code Commit:
`30f50df` — `feat(phase-18): orders filter auto-scroll and updated docs`

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

## Current Architecture

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

The legacy synchronous architecture has been removed. All future work must
preserve the async path above.

---

## Global Rules

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
- Do not introduce duplicate data paths for read-only compositions

---

## Analytics Architecture Rules

### Click

Click is a standalone domain.

```text
Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend
```

### Conversion Analytics

Uses `loadAffiliateAsync()`.

Do not create:

- `loadConversionAsync`
- a Conversion repository
- a Conversion service

Aggregations stay in the page layer.

### Revenue Analytics

Uses `loadAffiliateAsync()`.

Do not create:

- `loadRevenueAsync`
- a Revenue repository
- a Revenue service

Aggregations stay in the page layer.

### Commission Analytics

Uses `loadAffiliateAsync()`.

Do not create:

- `loadCommissionAsync`
- a Commission repository
- a Commission service

Aggregations stay in the page layer.

### Approved-Bucket Rule

`paid` is treated as approved through the shared predicate
`isApprovedStatus(status)` in `src/lib/analytics/format.ts`.

Commission reconciliation must satisfy:

```text
approved + pending + rejected = total
```

---

## Completed Phases

### Core Migration

- Phase 10A Complete
- Phase 10B Complete
- Phase 11A Complete
- Phase 11B Complete

### Affiliate Foundation and Core

- Phase 12B Affiliate Foundation Complete
- Phase 13A Offer Center Complete
- Phase 13B Tracking Links Complete
- Phase 13C Conversions Complete
- Phase 13D Commission Dashboard Complete
- Phase 13E Revenue Analytics Complete

### Cashback

- Phase 14A Cashback Center Complete

### Notification

- Phase 14B-A Notification Foundation Complete
- Phase 14B-B Notification Center UI Complete

### Analytics Center

- Phase 15A Click Analytics Center Complete
- Phase 15B Conversion Analytics Center Complete
- Phase 15C Revenue Analytics Center Complete
- Phase 15D Commission Analytics Center Complete

### Phase 15E — Architecture Stabilization

Complete.

Delivered:

- Landing route `/` migrated to `loadDashboardAsync`
- No route uses the legacy synchronous hook path
- `paid` normalized into the approved analytics bucket
- Shared analytics helpers extracted to `src/lib/analytics/format.ts`
- Async loaders renamed from `useXAsync` to `loadXAsync`
- Legacy sync hooks, service objects, sync wrappers, sync repository methods,
  sync helper getters, and orphaned direct mock imports removed

### Profile

- Phase 16A Profile Foundation Complete
- Phase 16B Profile UI Complete
- Phase 16C Profile Management and Navigation Complete

Profile is a standalone domain and is not part of User.

### Phase 17 — Campaign Detail

Complete.

Campaign Detail belongs to Affiliate and is not a separate domain.

Delivered:

- `/app/campaigns/[campaignId]`
- `generateStaticParams` for `cmp-shopee-q2` and `cmp-tiktok-launch`
- Read-only campaign detail composition
- Campaign drill-down links from Offers and Tracking Links
- Parameterized mock-backend routing
- Orphaned `src/lib/mock/campaign-detail.ts` removed

### Phase 18 — Offer Detail Delivery

Complete.

Stable tag:
`phase-18-complete`

Delivered:

- `/app/offers/[offerId]`
- Offer detail composition
- Use-case-specific affiliate data loading
- Tracking requirements and commission presentation

### Phase 18 — Consumer UX Remediation

Complete.

Delivered:

- Consumer-focused dashboard and shared primary navigation
- Orders filter state driven by `?status=`
- Invalid order filters fall back to `all`
- Canonical order statuses:
  - `recorded`
  - `reconciling`
  - `approved`
  - `rejected`
  - `payable`
  - `paid`
- Orders loading and error route boundaries
- Filtered and global empty states
- Active order filter chip automatically scrolls into view
- Responsive verification at 360, 390, 430, 768, and desktop widths
- Affiliate use-case DTO ownership corrected
- Unsafe result casts removed
- No direct mock imports in `src/app` or `src/features`

### Phase 19 and 19.5 — Tracking Links Generator

Complete.

Stable tag:
`phase-19.5-complete`

Delivered:

- Workflow rename from `/create` to `/generator`
- `/app/tracking-links/generator/[offerId]`
- `TrackingLinkGeneratorNotFound`
- AOV fixture values reset to `0`
- AOV removed from `TrackingLinkAttributionCard` UI
- Existing Affiliate data path reused; no new domain or duplicate chain

---

## Current Domains

### Dashboard

Status: Complete

```text
Page
→ loadDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend
```

### Orders

Status: Complete

```text
Page
→ loadOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend
```

### Finance

Status: Complete

```text
Page
→ loadFinanceAsync
→ financeService
→ financeRepository
→ apiClient
→ mock-backend
```

### User

Status: Complete

Purpose:
More-menu navigation data only.

User is not the identity/profile domain.

```text
Page
→ loadUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend
```

### Affiliate

Status: Complete

```text
Page
→ loadAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend
```

Affiliate remains the source of truth for:

- Offers
- Tracking Links
- Conversions
- Revenue
- Commission
- Read-only Campaign Detail compositions

Current use-case DTOs include:

- `AffiliateData`
- `TrackingLinkGeneratorData`
- `OfferDetailData`

### Cashback

Status: Complete

```text
Page
→ loadCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend
```

### Notification

Status: Complete

```text
Page
→ loadNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend
```

### Click

Status: Complete

Standalone domain.

```text
Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend
```

### Profile

Status: Complete — foundation, UI, management, and navigation

Standalone domain. Not part of User.

```text
Page
→ loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository
→ apiClient
→ mock-backend
```

Current capabilities:

- Identity and contact information
- Initials or `avatarUrl` rendering
- Preferred platforms
- Membership tier
- Payout account
- Mock-only profile and payout editing
- Navigation entry from `/app/more`

Deferred:

- Avatar upload
- Real backend persistence
- Withdrawal
- Membership workflows
- Referral
- Settings

### Campaign Detail

Status: Complete

Part of Affiliate. Not a separate domain.

```text
Page
→ loadCampaignDetailAsync
→ campaignDetailService
→ campaignDetailRepository
→ apiClient
→ mock-backend
→ campaignDetails[campaignId]
```

---

## Current Route Inventory

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
- `/app/tracking-links`

Total:
21 route patterns.

Latest production build:
30/30 generated page instances.

---

## Current Stable Tags

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

Latest stable tag:
`phase-19.5-complete`

---

## Current Repository State

Architecture:
PASS — one async data path only.

Build:
PASS.

TypeScript:
PASS — 0 errors.

ESLint:
PASS — 0 errors, 0 warnings.

Diff check:
PASS.

Generated pages:
PASS — 30/30.

Routes:
PASS — 15 static, 4 parameterized SSG, 2 dynamic.

Manual Orders verification:
PASS — desktop, 360, 390, 430, and 768 widths.

Known remaining architecture debt from the synchronous path:
None. The legacy sync architecture was removed in Phase 15E.

---

## Next Planned Phase

Phase 20 — TBD, not started.

Do not begin Phase 20 without explicit approval.

Potential Phase 20 work already deferred from prior phases includes:

- Real AOV aggregate calculation for tracking-link metrics
- Other approved roadmap items after architecture review

---

## Mandatory Workflow Before Any New Phase

1. Read `docs/PROJECT_STATE.md`
2. Read `docs/HANDOFF.md`
3. Verify the current branch
4. Verify the latest stable tag
5. Verify the latest commits
6. Run the production build
7. Audit the current architecture
8. Produce analysis only
9. Wait for approval before creating or modifying implementation files

Never start coding immediately.

Never skip architecture analysis.

Never create files before approval.

---

## Source of Truth

This document is authoritative for roadmap, phase status, route counts, and the
current stable tag.

`docs/HANDOFF.md` is authoritative for operational context, implementation
notes, verification history, and detailed architecture constraints.
