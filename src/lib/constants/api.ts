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
    HISTORY: "/cashback/history",
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
  AFFILIATE: {
    ADVERTISERS: "/affiliate/advertisers",
    CAMPAIGNS: "/affiliate/campaigns",
    OFFERS: "/affiliate/offers",
    TRACKING_LINKS: "/affiliate/tracking-links",
    CONVERSIONS: "/affiliate/conversions",
  },
  NOTIFICATION: {
    LIST: "/notification/list",
  },
  CLICK: {
    LIST: "/click/list",
  },
} as const;
