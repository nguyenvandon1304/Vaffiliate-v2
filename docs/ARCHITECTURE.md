# Vaffiliate Architecture

## Core Data Flow

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

## Current Domains

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

Features:

* Offers
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

---

## Current Route Count

17

---

## Supported Platforms

* Shopee
* TikTok Shop

---

## Not Supported

* Lazada
* Tiki
* Sendo
* Amazon
* Other affiliate networks
