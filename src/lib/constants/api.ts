export const API_ENDPOINTS = {
  DASHBOARD: {
    SUMMARY: "/dashboard/summary",
    METRICS: "/dashboard/metrics",
    FEATURES: "/dashboard/features",
    HERO: "/dashboard/hero",
    QUICK_ACTIONS: "/dashboard/quick-actions",
    POPULAR_OFFERS: "/dashboard/popular-offers",
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
    JOINED_OFFERS: "/affiliate/joined-offers",
    PUBLISHER_PROFILE: "/affiliate/publisher-profile",
    TRACKING_LINK_STATS: "/affiliate/tracking-link-stats",
    CAMPAIGN_DETAIL: "/campaign/detail",
    CAMPAIGN_STATISTICS: "/campaign/statistics",
    OFFER_DESTINATION_URLS: "/affiliate/offer-destination-urls",
    OFFER_REQUIREMENTS: "/affiliate/offer-requirements",
    OFFER_TRACKING_RULES: "/affiliate/offer-tracking-rules",
  },
  NOTIFICATION: {
    LIST: "/notification/list",
  },
  CLICK: {
    LIST: "/click/list",
  },
  PROFILE: {
    DETAIL: "/profile/detail",
    PAYOUT_ACCOUNT: "/profile/payout-account",
    UPDATE: "/profile/update",
    PAYOUT_UPDATE: "/profile/payout-update",
  },
} as const;
