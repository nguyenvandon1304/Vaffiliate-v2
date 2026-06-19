# Vaffiliate Project State

## Current Status

Current Phase:
19.5 Complete

Last Stable Tag:
phase-17-complete

Route Count:
21 (17 ○ static + 4 ● SSG dynamic —
  /app/campaigns/[campaignId] pre-rendered for cmp-shopee-q2 and cmp-tiktok-launch
  /app/tracking-links/[trackingLinkId] pre-rendered for trk-001/002/003
  /app/tracking-links/generator/[offerId] pre-rendered for off-shopee-fashion/beauty/home)

Build Status:
PASS

Lint Status:
PASS (0 errors)

Last Verified Commit:
phase-17-complete (19 + 19.5 changes uncommitted)

---

## Current Architecture

Page
→ Async Loader
→ Service
→ Repository
→ apiClient
→ mock-backend
→ mock domain slice

---

## Global Rules

* Async-first architecture
* Server Component first
* No client fetching
* No React Query
* No Redux
* No Zustand
* No Context for data loading
* No direct mock imports in pages/components
* Presentational components receive data via props
* Joins and aggregations live in page layer
* Shopee and TikTok Shop only
* No generic affiliate network abstraction

---

## Analytics Architecture Rules

### Click Domain

Standalone domain.

Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend

### Conversion Analytics

Uses:

loadAffiliateAsync()

No dedicated repository.

No dedicated service.

No dedicated hook.

Analytics are page-level aggregations.

### Revenue Analytics

Uses:

loadAffiliateAsync()

No dedicated repository.

No dedicated service.

No dedicated hook.

Analytics are page-level aggregations.

### Commission Analytics

Uses:

loadAffiliateAsync()

No dedicated repository.

No dedicated service.

No dedicated hook.

Analytics are page-level aggregations.

Do NOT create:

* loadConversionAsync
* loadRevenueAsync
* loadCommissionAsync

---

## Commission Business Rules

paid status is treated as approved

Commission reconciliation must satisfy:

approved + pending + rejected = total commission

---

## Completed Phases

### Core Migration

* Phase 10A Complete
* Phase 10B Complete
* Phase 11A Complete
* Phase 11B Complete

### Affiliate Foundation

* Phase 12B Complete

### Affiliate Core

* Phase 13A Offer Center Complete
* Phase 13B Tracking Links Complete
* Phase 13C Conversions Complete
* Phase 13D Commission Dashboard Complete
* Phase 13E Revenue Analytics Complete

### Cashback

* Phase 14A Cashback Center Complete

### Notification

* Phase 14B-A Notification Foundation Complete
* Phase 14B-B Notification Center UI Complete

### Analytics Center

* Phase 15A Click Analytics Center Complete
* Phase 15B Conversion Analytics Center Complete
* Phase 15C Revenue Analytics Center Complete
* Phase 15D Commission Analytics Center Complete

### Stabilization

* Phase 15E Architecture Stabilization Complete

Done:

* Landing route / migrated to async (loadDashboardAsync); no route uses the sync path
* paid normalized as approved across conversions, commission, cashback (isApprovedStatus)
* Pure analytics helpers extracted to src/lib/analytics/format.ts
* Async loaders renamed useXAsync → loadXAsync (8 loaders + files); they are
  server-side data loaders, not React hooks. Fixes react-hooks/rules-of-hooks
  lint errors (was 14 errors; lint now passes with 0 errors).
* Legacy sync architecture DELETED. Removed the 5 sync hook files
  (useDashboard/useFinance/useOrders/useCashback/useUser), the 5 *Service
  objects + get*DataService() sync wrappers, the sync get*Data() repository
  methods, the sync helper getters (getDashboardSummary/getHomeMetrics/
  getOrders/getCashbackPlatforms/getMoreMenuItems/etc.), and the now-orphaned
  @/lib/mock imports in the dashboard/finance/orders/cashback/user repositories.
  Single async path only.

### Profile

* Phase 16A Profile Foundation Complete (data layer only)
* Phase 16B Profile UI Complete (route /app/profile + presentational
  components; reuses loadProfileAsync; no new data layer)
* Phase 16C Profile Management + Navigation Complete (mock-only edit forms
  for personal info and payout account, initials + avatarUrl rendering, "Hồ
  sơ" link in /app/more)

### Campaign Detail

* Phase 17 Campaign Detail Complete (drill-down route
  /app/campaigns/[campaignId] + presentational components; composed on top
  of the Affiliate chain; no duplicate data path; multi-campaign resolution
  via /campaign/detail/:id and /campaign/statistics/:id; orphaned
  campaign-detail.ts mock deleted)

### Tracking Links Generator

* Phase 19 Tracking Links Generator Complete (workflow rename from /create to
  /generator; renamed feature folder; renamed component TrackingLinkGeneratorNotFound;
  fixture AOV reset to 0; AOV removed from AttributionCard UI; build passes)

---

## Current Affiliate Scope

Supported Platforms:

* Shopee
* TikTok Shop

Not Supported Yet:

* Lazada
* Tiki
* Sendo
* Amazon
* Any other affiliate network

---

## Current Domains

### Dashboard

Status: Complete

### Orders

Status: Complete

### Finance

Status: Complete

### User

Status: Complete

### Affiliate

Status: Complete

Features:

* Offers
* Tracking Links
* Conversions
* Commission Dashboard
* Revenue Analytics

### Cashback

Status: Complete

Features:

* Cashback History
* Cashback Statistics
* Cashback Filters
* Cashback Generator

### Notification

Status: Complete

Features:

* Notification Foundation
* Notification Center
* Notification Statistics
* Notification Filters
* Notification List

### Click

Status: Complete

Features:

* Click Statistics
* Click Filters
* Click List

### Profile

Status: Complete (data layer + UI + management + navigation)

Standalone domain. NOT part of User. Owns identity + payout account.

Route: /app/profile (static ○, async Server Component).

Reuses loadProfileAsync — no new data layer added in 16B/16C.

Features (data layer):

* Profile identity (name, email, phone, avatar, member tier, joined date)
* Preferred platforms (Shopee / TikTok Shop)
* Payout account

UI components (presentational, props-driven):

* ProfileHeader (avatarUrl rendered when present; initials fallback from fullName)
* ProfileInfoCard (name, email, phone, joined date — read-only)
* PayoutAccountCard (method, provider, account number, holder, verification — read-only)
* ProfileStatsCard (preferred platforms count, member tier, joined year —
  derived in page layer)
* ProfileManagementPanel (mock-only editing for personal info + payout account)

Wiring (16C additions):

* /app/more `Hồ sơ` menu item routes to /app/profile
* ProfileManagementPanel uses saveProfileEditServiceAsync / savePayoutAccountServiceAsync
  through profile-edit.repository and apiClient (mock-only persistence inside
  the mock layer)
* src/lib/mock/profile-store.ts holds the mutable mock state for the session

Not built (deferred): avatar upload (URL-only rendering), withdrawal,
membership, referral, settings.

---

### Campaign Detail

Status: Complete (data layer + UI + drill-down)

Part of Affiliate. NOT a separate domain.

Routes:

* /app/campaigns/[campaignId] (SSG ●, async Server Component,
  pre-rendered for cmp-shopee-q2 and cmp-tiktok-launch via
  generateStaticParams composed from loadAffiliateAsync().campaigns)

Chain:

Page (/app/campaigns/[campaignId])
→ loadCampaignDetailAsync
→ campaignDetailService (getCampaignDetailServiceAsync,
   getCampaignStatisticsServiceAsync)
→ campaignDetailRepository (getCampaignDetailAsync,
   getCampaignStatisticsAsync)
→ apiClient
→ mock-backend
→ campaignDetails map (keyed by campaignId)

Endpoints:

* /campaign/detail/:campaignId
* /campaign/statistics/:campaignId

UI components (presentational, props-driven):

* CampaignHeader (campaign name + advertiser + status badge + date range)
* CampaignCommissionCard (model + rate + note)
* CampaignTrackingCard (base URL + destination + supported parameters)
* CampaignStatsGrid (statistics tiles)
* CampaignNotFound (rendered when loadCampaignDetailAsync throws on
  unknown id)

Drill-down:

* OfferTable now renders campaign name as a link to
  /app/campaigns/[campaignId] (offerViews include campaignId, campaignName)
* TrackingLinkTable now renders campaign name as a link to
  /app/campaigns/[campaignId] (linkViews include campaignId, campaignName)
* No top-level menu entry.

Not built (deferred): campaign CRUD, per-campaign offer/tracking-link lists
on the detail page, write actions (mock backend is read-only here).

---

## Existing Async Domains

### Dashboard

Page
→ loadDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend

### Orders

Page
→ loadOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend

### Finance

Page
→ loadFinanceAsync
→ financeService
→ financeRepository
→ apiClient
→ mock-backend

### User

Page
→ loadUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend

### Affiliate

Page
→ loadAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend

Consumers:

* Offer Center
* Tracking Links Center
* Conversion Analytics Center
* Revenue Analytics Center
* Commission Analytics Center

### Cashback

Page
→ loadCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend

### Notification

Page
→ loadNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend

### Click

Page
→ loadClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend

### Profile

Page (/app/profile)
→ loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository (getProfileDataAsync)
→ apiClient
→ mock-backend

### Campaign Detail

Page (/app/campaigns/[campaignId])
→ loadCampaignDetailAsync
→ campaignDetailService (getCampaignDetailServiceAsync,
   getCampaignStatisticsServiceAsync)
→ campaignDetailRepository (getCampaignDetailAsync,
   getCampaignStatisticsAsync)
→ apiClient
→ mock-backend
→ campaignDetails map (keyed by campaignId)

---

## Current Routes

### Public

* /
* /login
* /register

### App

* /app
* /app/orders
* /app/finance
* /app/more
* /app/offers
* /app/offers/[offerId] (SSG ● — pre-rendered for off-shopee-fashion,
  off-shopee-beauty, off-tiktok-home)
* /app/tracking-links
* /app/tracking-links/[trackingLinkId] (SSG ● — pre-rendered for trk-001,
  trk-002, trk-003)
* /app/tracking-links/generator/[offerId] (SSG ● — pre-rendered for
  off-shopee-fashion, off-shopee-beauty, off-tiktok-home)
* /app/conversions
* /app/commission
* /app/revenue
* /app/cashback
* /app/notifications
* /app/clicks
* /app/profile
* /app/campaigns/[campaignId] (SSG ● — pre-rendered for cmp-shopee-q2
  and cmp-tiktok-launch)

Total:
21 routes (17 ○ static + 4 ● SSG dynamic)

---

## Current Stable Tags

* architecture-v2-stable
* phase-11-stable
* phase-14A-stable
* phase-14B-foundation-stable
* phase-14B-ui-stable
* phase-14B-complete
* phase-15D-complete
* phase-16A-complete
* phase-16B-complete
* phase-16C-complete
* phase-17-complete

---

## Current Repository State

Affiliate Core:
COMPLETE

Cashback:
COMPLETE

Notification:
COMPLETE

Click Analytics:
COMPLETE

Conversion Analytics:
COMPLETE

Revenue Analytics:
COMPLETE

Commission Analytics:
COMPLETE

All current routes:
Static ○ or SSG ●

Build:
PASS

TypeScript:
PASS

Lint:
PASS (0 errors)

Phase 15E note:
Legacy sync data path fully deleted. Only the async path remains:
Page → Async Loader → Service → Repository → apiClient → mock-backend.
The 5 sync hooks, *Service objects, get*DataService() wrappers, sync
get*Data() repository methods, sync helper getters, and orphaned @/lib/mock
imports are all gone. "No direct mock imports" now holds at the file level,
not just the route level.

Phase 17 note:
Campaign Detail is composed on top of the Affiliate chain (no duplicate
data path). Mock backend was refactored from a flat endpoint map to
exact-match + prefix-match routing so /campaign/detail/:id and
/campaign/statistics/:id can resolve by id; existing endpoints unchanged.
All previous endpoints preserved identical behavior — the only behavioral
change is that the campaign detail endpoint now resolves the entry from the
campaignDetails map by id, and throws (rendered as not-found by the page
layer) on an unknown id.

---

## Next Planned Phase

Phase 20 (TBD — not started. Do not begin without approval.)

Phase 17 Campaign Detail is complete:

* Route /app/campaigns/[campaignId] (SSG ● via generateStaticParams)
* Page composes loadCampaignDetailAsync — no new data path
* Components: CampaignHeader, CampaignCommissionCard, CampaignTrackingCard,
  CampaignStatsGrid, CampaignNotFound (presentational, props-driven, in
  src/features/campaigns/)
* Drill-down: OfferTable and TrackingLinkTable render campaign name as a
  link to /app/campaigns/[campaignId] (offerViews and linkViews now carry
  campaignId)
* Multi-campaign resolution via /campaign/detail/:id (mock backend prefix
  routing); cmp-shopee-q2 and cmp-tiktok-launch fixtures present
* Orphaned src/lib/mock/campaign-detail.ts deleted; canonical fixture is the
  campaignDetails map in src/lib/mock/affiliate.ts

Phase 19 + 19.5 Tracking Links Generator is complete:

* Route /app/tracking-links/generator/[offerId] (SSG ● via generateStaticParams;
  pre-rendered for off-shopee-fashion, off-shopee-beauty, off-tiktok-home)
* Workflow rename from /create to /generator throughout
* TrackingLinkGeneratorNotFound (was TrackingLinkCreateNotFound)
* TrackingLinkMetrics.aov fixture reset to 0 across all trackingLinkStats
  (trk-001, trk-002, trk-003) — no real aggregate available yet
* AOV removed from TrackingLinkAttributionCard UI (kept in type for Phase 20)
* Build: PASS. Lint: PASS. SSG: PASS.

---

## Notes

The following architecture is the source of truth:

Page
→ Async Loader
→ Service
→ Repository
→ apiClient
→ mock-backend

All future phases must preserve this flow.

Do not introduce:

* React Query
* SWR
* Redux
* Zustand
* Context-based data loading
* Direct mock imports
* Client-side fetching

Notification domain is fully implemented.

Analytics Center is fully implemented through Phase 15D.

Phase 15E (Stabilization) is complete:
* `/` migrated to the async data path (no route uses sync hooks).
* `paid` is now treated as `approved` across all analytics pages and cashback,
  via the single shared predicate `isApprovedStatus` in src/lib/analytics/format.ts.
* Pure helpers (formatVnd/formatDate/parseRate/parseOrderValue/supportedPlatforms)
  extracted to src/lib/analytics/format.ts; joins and aggregations remain in the page layer.
* Async loaders renamed useXAsync → loadXAsync (server loaders, not React hooks).
* Legacy sync architecture fully deleted (5 sync hooks, *Service objects,
  get*DataService() wrappers, sync get*Data() repo methods, sync helper getters,
  orphaned @/lib/mock imports). Single async path only.

Working tree reconciled with roadmap.

Phase 16A Profile Foundation is complete (data layer only — standalone Profile
domain, not part of User).

Phase 16B Profile UI is complete (route /app/profile + presentational
components, reusing loadProfileAsync; no new data layer).

Next milestone:

Phase 16C (Profile — next increment).
