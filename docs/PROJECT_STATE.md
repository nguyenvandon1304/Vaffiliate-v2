# Vaffiliate Project State

## Current Status

Current Phase:
16A Complete

Last Stable Tag:
phase-15D-complete

Route Count:
15

Build Status:
PASS

Lint Status:
PASS (0 errors)

Last Verified Commit:
885dc0c (phase-15E committed; 16A changes uncommitted)

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

Status: Foundation Complete (data layer only)

Standalone domain. NOT part of User. Owns identity + payout account.

No route. No page. No UI yet.

Features (data layer):

* Profile identity (name, email, phone, avatar, member tier, joined date)
* Preferred platforms (Shopee / TikTok Shop)
* Payout account

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

(no page yet — data layer only)
loadProfileAsync
→ getProfileDataServiceAsync
→ profileRepository (getProfileDataAsync)
→ apiClient
→ mock-backend

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
* /app/tracking-links
* /app/conversions
* /app/commission
* /app/revenue
* /app/cashback
* /app/notifications
* /app/clicks

Total:
15 routes

---

## Current Stable Tags

* architecture-v2-stable
* phase-11-stable
* phase-14A-stable
* phase-14B-foundation-stable
* phase-14B-ui-stable
* phase-14B-complete
* phase-15D-complete

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
Static ○

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

---

## Next Planned Phase

Phase 16B Profile UI

Status: Not Started (do not begin without approval)

Goal:

* Build the Profile UI on top of the 16A data foundation
* Follow Page → Async Loader → Service → Repository → apiClient → mock-backend
* Reuse loadProfileAsync (do not create a second data path)
* Server Component first
* Shopee/TikTok-only ecosystem remains unchanged

16A Profile Foundation is complete (data layer only):

* src/types/profile.ts
* src/lib/mock/profile.ts
* src/repositories/profile.repository.ts
* src/services/profile.service.ts
* src/hooks/loadProfileAsync.ts

No route / page / UI was created in 16A.

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

Next milestone:

Phase 16B Profile UI.
