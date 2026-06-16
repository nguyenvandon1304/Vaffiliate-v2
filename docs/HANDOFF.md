# Vaffiliate Handoff

## Project Overview

Project: Vaffiliate

Architecture Version: V2 Async Architecture

Current Phase: 15D Complete

Current Stable Tag:
phase-15D-complete

Latest Verified Commit:
0f276de

Build Status:
PASS

TypeScript:
PASS

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
→ Async Hook
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
→ useDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend

---

### Orders

Status: Complete

Chain:

Page
→ useOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend

---

### Finance

Status: Complete

Chain:

Page
→ useFinanceAsync
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
→ useUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend

---

### Affiliate

Status: Complete

Chain:

Page
→ useAffiliateAsync
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

* useConversionAsync
* useRevenueAsync
* useCommissionAsync

Analytics must remain page-level compositions.

---

### Cashback

Status: Complete

Chain:

Page
→ useCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend

---

### Notification

Status: Complete

Chain:

Page
→ useNotificationAsync
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
→ useClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend

Files:

src/types/click.ts

src/lib/mock/click.ts

src/repositories/click.repository.ts

src/services/click.service.ts

src/hooks/useClickAsync.ts

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

useAffiliateAsync

Additional data:

useClickAsync

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

useAffiliateAsync

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

useAffiliateAsync

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

src/hooks/useProfileAsync.ts

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

Static Routes:
PASS

Architecture:
PASS

No known architectural violations.

Last Reconciled State:

phase-15D-complete

commit 0f276de
