# Vaffiliate Handoff

## Project Overview

Project: Vaffiliate

Architecture Version: V2 Async Architecture

Current Phase: Phase 18 Remediation Complete

Current Stable Tag:
phase-18-remediation

Latest Verified Commit:
phase-17-complete (Phase 18 + Remediation changes uncommitted)

Build Status:
PASS

TypeScript:
PASS

Lint:
PASS (0 errors)

Route Status:
All routes static (○) / SSG (●) / Dynamic (ƒ) — 30 routes total

---

## Source Of Truth

Before starting any work, always read:

1. PROJECT_STATE.md
2. HANDOFF.md

If HANDOFF.md conflicts with PROJECT_STATE.md:

PROJECT_STATE.md is the authoritative source.

---

## Current Architecture

Mandatory flow:

Page
→ Async Loader
→ Service
→ Repository
→ apiClient
→ mock-backend

Rules:

* Async-first architecture
* Server Component first
* No client fetching
* No React Query
* No Redux
* No Zustand
* No Context-based data loading
* No direct repository access from pages
* No direct mock imports in pages/components
* Presentational components receive data via props
* Joins and aggregations live in page layer
* Shopee and TikTok only
* No affiliate-network abstraction layer

---

## Current Route Inventory

Public Routes

/
/login
/register

App Routes

/app
/app/orders
/app/finance
/app/more
/app/offers
/app/offers/[offerId] (SSG ● — pre-rendered for off-shopee-fashion,
  off-shopee-beauty, off-tiktok-home)
/app/tracking-links
/app/tracking-links/[trackingLinkId] (SSG ● — pre-rendered for trk-001,
  trk-002, trk-003)
/app/tracking-links/generator/[offerId] (SSG ● — pre-rendered for
  off-shopee-fashion, off-shopee-beauty, off-tiktok-home)
/app/conversions
/app/commission
/app/revenue
/app/cashback
/app/notifications
/app/clicks
/app/profile
/app/campaigns/[campaignId]

Total:
21 routes (17 ○ static + 4 ● SSG dynamic)

---

## Current Domains

### Dashboard

Status: Complete

Chain:

Page
→ loadDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend

---

### Orders

Status: Complete

Chain:

Page
→ loadOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend

---

### Finance

Status: Complete

Chain:

Page
→ loadFinanceAsync
→ financeService
→ financeRepository
→ apiClient
→ mock-backend

---

### User

Status: Complete

Purpose:

More menu only.

Important:

User is NOT an identity/profile domain.

Chain:

Page
→ loadUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend

---

### Affiliate

Status: Complete

Chain:

Page
→ loadAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend

Features powered by Affiliate:

* Offers
* Tracking Links
* Conversions
* Commission
* Revenue

Important:

Affiliate remains the single source of truth for:

* Offers
* Tracking Links
* Conversions
* Revenue
* Commission

Do NOT create:

* loadConversionAsync
* loadRevenueAsync
* loadCommissionAsync

Analytics must remain page-level compositions.

---

### Cashback

Status: Complete

Chain:

Page
→ loadCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend

---

### Notification

Status: Complete

Chain:

Page
→ loadNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend

---

### Click

Status: Complete

Standalone domain.

Chain:

Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend

Files:

src/types/click.ts

src/lib/mock/click.ts

src/repositories/click.repository.ts

src/services/click.service.ts

src/hooks/loadClickAsync.ts

Route:

/app/clicks

---

### Profile

Status: Complete (data layer + UI)

Standalone domain. NOT part of User.

User owns: More menu + navigation items.
Profile owns: identity, avatar, email, phone, member tier, preferred
platforms, and payout account.

Chain:

Page (/app/profile)
→ loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository (getProfileDataAsync)
→ apiClient
→ mock-backend

Data layer files (16A — reused, unchanged):

src/types/profile.ts

src/lib/mock/profile.ts

src/repositories/profile.repository.ts

src/services/profile.service.ts

src/hooks/loadProfileAsync.ts

UI files (16B):

src/app/app/profile/page.tsx (async Server Component, static ○)

src/features/profile/ProfileHeader.tsx

src/features/profile/ProfileInfoCard.tsx

src/features/profile/PayoutAccountCard.tsx

src/features/profile/ProfileStatsCard.tsx

Endpoints:

/profile/detail
/profile/payout-account

Route:

/app/profile (static ○)

Notes:

* profile.service.ts follows the 15E-cleaned convention: it exports only the
  standalone getProfileDataServiceAsync(), no service object.
* 16B added UI only. No new loader/service/repository/mock; the page reuses
  loadProfileAsync(). Single data path preserved.
* Components are presentational and props-driven (no data loading, no
  "use client"). ProfileStatsCard values are derived in the page layer.
* ProfileHeader renders an initials avatar from fullName; profile.avatarUrl is
  kept in the data model but not rendered yet (no public asset added in 16B).
* Profile is reachable by URL only — no navigation entry was added (out of
  16B scope).
* Not built (deferred): edit form, avatar upload, payout editing, withdrawal,
  membership, referral, settings.

---

### Campaign Detail

Status:
Complete (data layer + UI + drill-down)

Part of Affiliate domain. NOT a separate domain.
Affiliate remains the single source of truth for offers, tracking links,
conversions, revenue, commission. Campaign Detail is a read-only drill-down
composed on top of the Affiliate chain.

Chain:

Page (/app/campaigns/[campaignId])
→ loadCampaignDetailAsync
→ campaignDetailService (getCampaignDetailServiceAsync, getCampaignStatisticsServiceAsync)
→ campaignDetailRepository (getCampaignDetailAsync, getCampaignStatisticsAsync)
→ apiClient
→ mock-backend
→ campaignDetails map (keyed by campaignId)

Data layer files:

src/types/affiliate.ts (CampaignDetail, CampaignStatistic)

src/lib/mock/affiliate.ts (campaignDetails map; second fixture added for
cmp-tiktok-launch so multi-campaign resolution is exercised)

src/repositories/campaign-detail.repository.ts

src/services/campaign-detail.service.ts

src/hooks/loadCampaignDetailAsync.ts

Endpoints:

/campaign/detail/:campaignId
/campaign/statistics/:campaignId

Routes:

/app/campaigns/[campaignId] (SSG via generateStaticParams; uses
loadAffiliateAsync().campaigns to enumerate ids; pre-rendered for
cmp-shopee-q2 and cmp-tiktok-launch)

UI files (Phase 17):

src/features/campaigns/CampaignHeader.tsx

src/features/campaigns/CampaignCommissionCard.tsx

src/features/campaigns/CampaignTrackingCard.tsx

src/features/campaigns/CampaignStatsGrid.tsx

src/features/campaigns/CampaignNotFound.tsx

Notes:

* Mock backend refactored from a flat endpoint map to exact-match + prefix-
  match routing. Exact handlers stay as `(endpoint) => data`. Parameterized
  routes match `${prefix}/${value}` and pass the value into a builder. This
  keeps the simple endpoints untouched while letting /campaign/detail/:id and
  /campaign/statistics/:id resolve by campaignId. Unknown ids throw and the
  page renders CampaignNotFound.
* Components are presentational and props-driven (no data loading, no
  "use client"). Joins and aggregations live in the page layer (e.g.
  generateStaticParams composes loadAffiliateAsync().campaigns).
* No top-level menu entry. Drill-down comes from Offers and Tracking Links
  tables via the campaign name link (offerView.campaignId /
  trackingLinkView.campaignId added to the view models).
* Orphaned src/lib/mock/campaign-detail.ts (created during initial data-layer
  scaffolding, never imported) was deleted. Canonical fixture is the
  campaignDetails map inside src/lib/mock/affiliate.ts.
* The 16C post endpoints (PROFILE.UPDATE / PROFILE.PAYOUT_UPDATE) still
  return mutated mock state via the same exact handler; body arguments
  continue to be ignored (same behavior as before the refactor — the body was
  never actually plumbed through resolveMockEndpoint in the prior client.ts).

---

## Analytics Centers

### Phase 15A — Click Analytics Center

Status:
Complete

Route:

/app/clicks

Components:

* ClickStats
* ClickFilters
* ClickTable

Standalone domain.

---

### Phase 15B — Conversion Analytics Center

Status:
Complete

Uses:

loadAffiliateAsync

Additional data:

loadClickAsync

Components:

* ConversionStats
* ConversionPlatformBreakdown
* ConversionTrendTable
* ConversionTopLinksTable
* ConversionTable
* ConversionFilters

Architecture:

Page-level aggregation only.

No dedicated repository/service/hook.

---

### Phase 15C — Revenue Analytics Center

Status:
Complete

Uses:

loadAffiliateAsync

Components:

* RevenueStats
* RevenuePlatformBreakdown
* RevenueTrendTable
* RevenueTopLinksTable
* RevenueCampaignTable
* RevenueOfferTable

Architecture:

Page-level aggregation only.

No dedicated repository/service/hook.

Important:

RevenuePlatformBreakdown includes:

* Revenue
* Commission
* Share %

---

### Phase 15D — Commission Analytics Center

Status:
Complete

Uses:

loadAffiliateAsync

Components:

* CommissionStats
* CommissionPlatformBreakdown
* CommissionTrendTable
* CommissionTopLinksTable
* CommissionCampaignTable

Business Rules:

paid status is treated as approved

Commission buckets:

approved
pending
rejected

Rule:

approved + pending + rejected = total

Highest Commission Offer:

Removed

Reason:

No drill-down destination exists.

Highest Commission Campaign:

Retained

Backed by:

CommissionCampaignTable

CommissionTopLinksTable:

Shows:

* trackingCode
* platform
* commission
* conversions

Does NOT show:

avgCommission

Reason:

No valid click denominator exists.

---

## Known Architecture Decisions

Click is a standalone domain.

Conversion is NOT a standalone domain.

Revenue is NOT a standalone domain.

Commission is NOT a standalone domain.

All three are Affiliate feature compositions.

Do not split them into separate repositories/services/hooks.

Keep aggregations inside page.tsx.

### Phase 15E Stabilization Decisions

Single async data flow (route level):

No route uses the legacy sync hook path. The landing route / was migrated
to loadDashboardAsync. All 15 routes now flow through Page → Async Loader →
Service → Repository → apiClient → mock-backend.

paid is treated as approved:

The canonical predicate isApprovedStatus(status) in src/lib/analytics/format.ts
is the single source for approved-bucket logic. Used by conversions, commission,
and cashback. approved + pending + rejected = total now holds on every analytics
page (previously the conversions page excluded paid).

Shared analytics helpers:

formatVnd, formatDate, parseRate, parseOrderValue, supportedPlatforms, and
isApprovedStatus live in src/lib/analytics/format.ts. The commission, revenue,
and conversions pages import them instead of redefining local copies.

Joins and Map aggregations remain inline in each page.tsx (page-layer rule
unchanged). Only the pure stateless helpers were extracted.

Async loaders renamed:

The 8 useXAsync loaders were renamed to loadXAsync (files included). They are
server-side async data loaders, not React hooks, so the use* prefix was wrong
and triggered react-hooks/rules-of-hooks lint errors. Renaming fixed all 14
errors; lint now passes with 0 errors.

Legacy sync architecture DELETED (Step 2, completed):

The entire legacy sync data path is gone. Removed:

* 5 sync hook files: useDashboard, useFinance, useOrders, useCashback, useUser
* 5 *Service objects: dashboardService, financeService, ordersService,
  cashbackService, userService (consumed only by the deleted sync hooks)
* 5 get*DataService() sync wrappers in the service files
* 5 sync get*Data() repository methods
* sync helper getters: getDashboardSummary, getHomeMetrics, getHomeFeatures,
  getHeroPreview, getQuickActions, getFinanceSummary, getFinanceTransactions,
  getOrders, getOrderFilters, getCashbackPlatforms, getCashbackHistory,
  getMoreMenuItems
* the now-orphaned @/lib/mock imports in the dashboard/finance/orders/
  cashback/user repositories

Each service now exports only get*DataServiceAsync(); each repository exports
only get*DataAsync() backed by apiClient. The "no direct mock imports" rule
now holds at the file level, not just the route level. git grep confirms zero
matches for the deleted symbols outside historical docs.

---

## Current Stable Tags

architecture-v2-stable

phase-11-stable

phase-14A-stable

phase-14B-foundation-stable

phase-14B-ui-stable

phase-14B-complete

phase-15D-complete

phase-16A-complete

phase-16B-complete

phase-16C-complete

phase-17-complete

---

## Next Planned Phase

Phase 19 (TBD — not started. Do not begin without approval.)

---

### Phase 18 Remediation — Consumer UX Foundation Fix

Status: COMPLETE — remediation corrections applied on top of Phase 18

Scope:

- **Orders URL-driven filter**: Filter state lives in `?status=` query parameter. `OrdersFilters` is a client component reading from `useSearchParams` and updating via `useRouter`. The loader receives `OrderStatusFilter` and filters server-side. Invalid values fall back to `"all"`.
- **Orders loading/error boundaries**: `src/app/app/orders/loading.tsx` renders `OrdersLoadingState`. `src/app/app/orders/error.tsx` renders consumer-friendly error with retry via `reset()`.
- **Type safety**: Page uses `await loadOrdersAsync(statusFilter)` with proper return type. No `let data;` or `any`.
- **AffiliateData god payload removed**: `defaultDestinationUrls`, `offerRequirements`, `offerTrackingRules` removed from `AffiliateData`. `getAffiliateDataAsync()` no longer fetches them. Use-case-specific loaders created:
  - `loadTrackingLinkGeneratorContextAsync(offerId)` → `TrackingLinkGeneratorContext`
  - `loadOfferDetailContextAsync(offerId)` → `OfferDetailContext`
- **PopularOffers semantics**: `PopularOffer.commissionRate` renamed to `PopularOffer.rewardLabel`. Value is a user-facing presentation string (e.g., "8% hoàn tiền"), not the internal `networkCommission`.
- **No direct mock imports**: `git grep "@/lib/mock" -- src/app src/features` returns 0 matches.

Quality Gates:
- TypeScript: PASS (0 errors)
- ESLint: PASS (0 warnings)
- Build: PASS (30/30 routes)
- Diff check: PASS (0)

New files:
- `src/lib/filterUtils.ts`
- `src/app/app/orders/loading.tsx`
- `src/app/app/orders/error.tsx`
- `src/repositories/affiliate.repository.ts` (extended with use-case loaders)
- `src/services/affiliate.service.ts` (extended with use-case service functions)
- `src/hooks/loadAffiliateAsync.ts` (extended with use-case loaders)
- `src/types/affiliate.ts` (added `TrackingLinkGeneratorData`, `OfferDetailData`)
- `src/types/orders.ts` (added `OrderStatusFilter`, `OrderDisplayStatus`)

Modified files:
- `src/features/orders/OrdersFilters.tsx`
- `src/app/app/orders/page.tsx`
- `src/repositories/orders.repository.ts`
- `src/services/orders.service.ts`
- `src/hooks/loadOrdersAsync.ts`
- `src/app/app/tracking-links/generator/[offerId]/page.tsx`
- `src/app/app/offers/[offerId]/page.tsx`
- `src/lib/mock/dashboard.ts`
- `src/types/dashboard.ts`
- `src/features/dashboard/PopularOffers.tsx`

---

### Phase 17 — Campaign Detail

Status:
Complete

Architecture Decision:

Campaign Detail is NOT a separate domain. It belongs to Affiliate.

Reason:

Affiliate is already the single source of truth for offers, tracking links,
conversions, revenue, and commission. Campaign Detail is a read-only
composition on top of the Affiliate chain (campaign → commission + tracking
settings + statistics). Creating a separate Campaign domain would have
duplicated data paths.

Created Files:

src/repositories/campaign-detail.repository.ts

src/services/campaign-detail.service.ts

src/hooks/loadCampaignDetailAsync.ts

src/features/campaigns/CampaignHeader.tsx

src/features/campaigns/CampaignCommissionCard.tsx

src/features/campaigns/CampaignTrackingCard.tsx

src/features/campaigns/CampaignStatsGrid.tsx

src/features/campaigns/CampaignNotFound.tsx

src/app/app/campaigns/[campaignId]/page.tsx

Modified Files:

src/types/affiliate.ts (CampaignDetail, CampaignStatistic added; OfferView
and TrackingLinkView gained campaignId + campaignName for drill-down)

src/lib/mock/affiliate.ts (campaignDetails map keyed by id; cmp-shopee-q2
plus new cmp-tiktok-launch fixture; satisfies Record<string, CampaignDetail>)

src/lib/constants/api.ts (CAMPAIGN_DETAIL, CAMPAIGN_STATISTICS endpoints)

src/lib/api/mock-backend.ts (refactored from flat endpoint map to
exact-match + prefix-match routing so /campaign/detail/:id and
/campaign/statistics/:id can resolve by id; existing endpoints unchanged)

src/repositories/campaign-detail.repository.ts (uri-encoded ids)

src/app/app/offers/page.tsx (offerViews now include campaignId, campaignName)

src/features/offers/OfferTable.tsx (campaign name is now a link to
/app/campaigns/[campaignId])

src/app/app/tracking-links/page.tsx (linkViews now include campaignId,
campaignName)

src/features/tracking-links/TrackingLinkTable.tsx (campaign name is now a
link to /app/campaigns/[campaignId])

Deleted Files:

src/lib/mock/campaign-detail.ts (orphaned duplicate of cmp-shopee-q2 fixture;
canonical data lives in the campaignDetails map in src/lib/mock/affiliate.ts)

Phase Scope (delivered):

* Full data layer through Async Loader (page → loader → service → repository
  → apiClient → mock-backend → campaignDetails[id]).
* Dynamic route /app/campaigns/[campaignId], pre-rendered via
  generateStaticParams using loadAffiliateAsync().campaigns as the source.
* Five presentational, props-driven components (no client fetching).
* Drill-down from Offers and Tracking Links tables via the campaign name
  link. View models extended to carry the campaign id.
* Mock backend now supports parameterized endpoints (prefix match); all
  previous endpoints preserved unchanged.
* No top-level menu entry (per scope).
* No avatar, edit, or write capability for campaign detail (read-only).

Not built (deferred to a future phase if needed):

* Campaign CRUD (admin).
* Campaign-level filters / aggregations on analytics pages (campaignId is
  present on views; filtering is page-layer work for later).
* Per-campaign offer/tracking-link/conversion lists (drill-down is to the
  campaign detail page; offer/listing pages already exist).

---

### Phase 19 + 19.5 — Tracking Links Generator

Status:
Complete (workflow rename only; no new data layer)

Scope:

* Workflow rename: /app/tracking-links/create/[offerId] → /app/tracking-links/generator/[offerId]
* Feature folder rename: tracking-links/create → tracking-links/generator
* Component rename: TrackingLinkCreateNotFound → TrackingLinkGeneratorNotFound
* Fixture correction: trackingLinkStats AOV reset to 0 (trk-001, trk-002, trk-003)
* UI cleanup: AOV removed from TrackingLinkAttributionCard (type preserved for Phase 20)

Architecture:
No new data path. Reuses loadAffiliateAsync. No new repository/service/hook.
No change to TrackingLinkStats shape, TrackingLinkMetrics shape, or route structure.

Modified Files:
src/features/tracking-links/generator/TrackingLinkGeneratorNotFound.tsx (was TrackingLinkCreateNotFound)
src/app/app/tracking-links/generator/[offerId]/page.tsx
src/lib/mock/affiliate.ts (3 AOV values → 0)
src/features/tracking-links/detail/TrackingLinkAttributionCard.tsx (AOV removed from render)

Deleted Files:
src/features/tracking-links/generator/TrackingLinkCreateNotFound.tsx

Build: PASS
Lint: PASS (0 errors; 0 warnings)
SSG: PASS — /app/tracking-links/generator/[offerId] pre-rendered for 3 offer IDs

Not built (deferred):
AOV aggregate calculation (Phase 20).

---

## Mandatory Workflow Before Any New Phase

1. Read PROJECT_STATE.md
2. Read HANDOFF.md
3. Verify git tag
4. Verify latest commit
5. Run npm run build
6. Audit current architecture
7. Produce analysis only
8. Wait for approval

Never start coding immediately.

Never skip architecture analysis.

Never create files before approval.

---

## Repository Health

Build:
PASS

TypeScript:
PASS

Lint:
PASS (0 errors)

Static Routes:
PASS — 28 ○ static + 2 ● SSG dynamic + 2 ƒ Dynamic:
  /app/campaigns/[campaignId] pre-rendered for cmp-shopee-q2 and cmp-tiktok-launch
  /app/offers/[offerId] pre-rendered for off-shopee-fashion/beauty/home
  /app/tracking-links/[trackingLinkId] pre-rendered for trk-001/002/003
  /app/tracking-links/generator/[offerId] pre-rendered for off-shopee-fashion/beauty/home
  /app/orders dynamic (ƒ) — URL searchParams
  /app/tracking-links dynamic (ƒ)

Architecture:
PASS at file level — single async data flow only. Phase 19 + 19.5 reuses the
same chain; no React Query/SWR/Redux/Zustand/Context/direct-mock-imports were
introduced. Tracking Links Generator is a workflow rename only; no new data path.
TrackingLinkMetrics.aov field preserved in type definition (Phase 20).

Known remaining debt:
None from the sync architecture — fully removed.

Last Reconciled State:

phase-17-complete (Phase 18 + Remediation changes uncommitted)
