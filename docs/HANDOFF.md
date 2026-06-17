# Vaffiliate Handoff

## Project Overview

Project: Vaffiliate

Architecture Version: V2 Async Architecture

Current Phase: 15E Complete

Current Stable Tag:
phase-15D-complete

Latest Verified Commit:
0f276de (working tree ahead — 15E changes uncommitted)

Build Status:
PASS

TypeScript:
PASS

Lint:
PASS (0 errors)

Route Status:
All routes static (○)

Total Routes:
15

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
/app/tracking-links
/app/conversions
/app/commission
/app/revenue
/app/cashback
/app/notifications
/app/clicks

Total:
15 routes

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

---

## Next Planned Phase

### Phase 16A — Profile Foundation

Status:
Not Started

Architecture Decision:

Profile is a standalone domain.

Profile is NOT a subdomain of User.

Reason:

User currently owns only More-menu navigation.

Profile owns:

* Personal information
* Payout account information

Planned Files:

src/types/profile.ts

src/lib/mock/profile.ts

src/repositories/profile.repository.ts

src/services/profile.service.ts

src/hooks/loadProfileAsync.ts

Phase Scope:

Data layer only.

No route.

No page.

No UI.

No profile screen yet.

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
PASS (0 errors; 4 pre-existing unused-var warnings unrelated to 15E)

Static Routes:
PASS (15/15 static, including / as async Server Component)

Architecture:
PASS at file level — single async data flow only. Legacy sync path fully
deleted; no direct @/lib/mock imports remain in the dashboard/finance/orders/
cashback/user repositories. paid normalized across all analytics + cashback.

Known remaining debt:
None from the sync architecture — fully removed. Only 4 cosmetic unused-var
lint warnings remain (revenue page totalCommission/totalConversions,
CashbackForm upcomingPlatforms, CommissionCampaignTable Badge import).

Last Reconciled State:

phase-15D-complete

commit 0f276de (working tree ahead — 15E changes uncommitted)
