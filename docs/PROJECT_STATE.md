# Vaffiliate Project State

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

### Notification

Status: Foundation Complete
Status: UI Not Started

---

## Current Stable Tags

* architecture-v2-stable
* phase-11-stable
* phase-14A-stable
* phase-14B-foundation-stable

---

## Current Route Count

16 routes

---

## Next Planned Phase

Phase 14B-B Notification Center UI

Goal:

* Create /app/notifications
* useNotificationAsync
* NotificationStats
* NotificationFilters
* NotificationTable
* Shopee/TikTok only
* Server Component only
* No client fetching

---

## Notes

Notification domain already exists:

* types
* mock
* repository
* service
* hook
* endpoint
* mock-backend registry

Only UI layer remains.
