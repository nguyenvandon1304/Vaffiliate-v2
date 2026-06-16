# Vaffiliate Project State

## Current Status

Current Phase:
15D Complete

Last Stable Tag:
phase-14B-complete

Route Count:
15

Build Status:
PASS

Last Verified Commit:
05cd6f8

---

## Current Architecture

Page
→ Async Hook
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

### Analytics

* Phase 15A Click Analytics Center Complete
* Phase 15B Conversion Analytics Center Complete
* Phase 15C Revenue Analytics Center Complete
* Phase 15D Commission Analytics Center Complete

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

---

## Existing Async Domains

### Dashboard

Page
→ useDashboardAsync
→ dashboardService
→ dashboardRepository
→ apiClient
→ mock-backend

### Orders

Page
→ useOrdersAsync
→ ordersService
→ ordersRepository
→ apiClient
→ mock-backend

### Finance

Page
→ useFinanceAsync
→ financeService
→ financeRepository
→ apiClient
→ mock-backend

### User

Page
→ useUserAsync
→ userService
→ userRepository
→ apiClient
→ mock-backend

### Affiliate

Page
→ useAffiliateAsync
→ affiliateService
→ affiliateRepository
→ apiClient
→ mock-backend

Consumers:

* Offer Center
* Tracking Links
* Conversions
* Commission Dashboard
* Revenue Analytics

### Cashback

Page
→ useCashbackAsync
→ cashbackService
→ cashbackRepository
→ apiClient
→ mock-backend

### Notification

Page
→ useNotificationAsync
→ notificationService
→ notificationRepository
→ apiClient
→ mock-backend

### Click

Page
→ useClickAsync
→ clickService
→ clickRepository
→ apiClient
→ mock-backend

---

## Current Routes

Public:

* /
* /login
* /register

App:

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

---

## Current Repository State

Affiliate Core:
COMPLETE

Cashback:
COMPLETE

Notification:
COMPLETE

All current routes:
Static ○

Build:
PASS

TypeScript:
PASS

No architectural violations detected.

---

## Next Planned Phase

Phase 16A Profile Foundation

Goal:

* Create Profile domain foundation
* Follow Page → Async Hook → Service → Repository → apiClient → mock-backend
* No second data path
* Server Component first
* Shopee/TikTok-only ecosystem remains unchanged
* Build foundation before UI

---

## Notes

The following architecture is now considered the source of truth:

Page
→ Async Hook
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

Working tree reconciled with roadmap.

Next milestone:

Phase 16A Profile Foundation.
