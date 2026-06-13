export const API_ENDPOINTS = {
  DASHBOARD: {
    SUMMARY: "/dashboard/summary",
    METRICS: "/dashboard/metrics",
    FEATURES: "/dashboard/features",
    HERO: "/dashboard/hero",
    QUICK_ACTIONS: "/dashboard/quick-actions",
  },
  CASHBACK: {
    PLATFORMS: "/cashback/platforms",
  },
  ORDERS: {
    LIST: "/orders/list",
    FILTERS: "/orders/filters",
  },
  FINANCE: {
    SUMMARY: "/finance/summary",
    TRANSACTIONS: "/finance/transactions",
  },
  USER: {
    MORE_MENU: "/user/more-menu",
  },
} as const;
