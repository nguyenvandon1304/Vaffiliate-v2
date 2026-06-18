import type {
  Advertiser,
  Campaign,
  CampaignDetail,
  Conversion,
  Offer,
  OfferId,
  OfferRequirement,
  OfferTrackingRules,
  TrackingLink,
  TrackingLinkStatsMap,
} from "@/types/affiliate";

export const campaignDetails = {
  "cmp-shopee-q2": {
    campaign: {
      id: "cmp-shopee-q2",
      advertiserId: "adv-shopee",
      name: "Shopee hoàn tiền quý 2",
      status: "active",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
    },
    advertiser: {
      id: "adv-shopee",
      name: "Shopee Việt Nam",
      platform: "Shopee" as const,
    },
    commission: {
      model: "CPS" as const,
      rate: "8%",
      note: "Áp dụng cho các offer thời trang và làm đẹp trong chiến dịch.",
    },
    trackingSettings: {
      baseUrl: "https://vaffiliate.vn/go/shopee",
      defaultDestinationUrl: "https://shopee.vn",
      supportedParameters: ["ref", "click_id", "campaign_id"],
    },
    statistics: [
      { label: "Tổng chuyển đổi", value: "128" },
      { label: "Chuyển đổi duyệt", value: "96" },
      { label: "Hoa hồng ước tính", value: "12.480.000đ" },
      { label: "CTR", value: "4.8%" },
    ],
  },
  "cmp-tiktok-launch": {
    campaign: {
      id: "cmp-tiktok-launch",
      advertiserId: "adv-tiktok",
      name: "TikTok Shop ra mắt hoàn tiền",
      status: "active",
      startDate: "2026-05-01",
    },
    advertiser: {
      id: "adv-tiktok",
      name: "TikTok Shop",
      platform: "TikTok Shop" as const,
    },
    commission: {
      model: "CPS" as const,
      rate: "6%",
      note: "Tập trung vào ngành hàng gia dụng và làm đẹp trong tháng ra mắt.",
    },
    trackingSettings: {
      baseUrl: "https://vaffiliate.vn/go/tiktok-shop",
      defaultDestinationUrl: "https://www.tiktok.com/shop",
      supportedParameters: ["ref", "click_id", "campaign_id"],
    },
    statistics: [
      { label: "Tổng chuyển đổi", value: "74" },
      { label: "Chuyển đổi duyệt", value: "52" },
      { label: "Hoa hồng ước tính", value: "6.120.000đ" },
      { label: "CTR", value: "3.6%" },
    ],
  },
} as const satisfies Record<string, CampaignDetail>;

export const advertisers: Advertiser[] = [
  { id: "adv-shopee", name: "Shopee Việt Nam", platform: "Shopee" },
  { id: "adv-tiktok", name: "TikTok Shop", platform: "TikTok Shop" },
];

export const campaigns: Campaign[] = [
  {
    id: "cmp-shopee-q2",
    advertiserId: "adv-shopee",
    name: "Shopee hoàn tiền quý 2",
    status: "active",
    startDate: "2026-04-01",
    endDate: "2026-06-30",
  },
  {
    id: "cmp-tiktok-launch",
    advertiserId: "adv-tiktok",
    name: "TikTok Shop ra mắt hoàn tiền",
    status: "active",
    startDate: "2026-05-01",
  },
];

export const offers: Offer[] = [
  {
    id: "off-shopee-fashion",
    campaignId: "cmp-shopee-q2",
    title: "Thời trang Shopee",
    commissionModel: "CPS",
    commissionRate: "8%",
    category: "Thời trang",
  },
  {
    id: "off-shopee-beauty",
    campaignId: "cmp-shopee-q2",
    title: "Làm đẹp Shopee",
    commissionModel: "CPS",
    commissionRate: "10%",
    category: "Làm đẹp",
  },
  {
    id: "off-tiktok-home",
    campaignId: "cmp-tiktok-launch",
    title: "Đồ gia dụng TikTok Shop",
    commissionModel: "CPS",
    commissionRate: "6%",
    category: "Gia dụng",
  },
];

export const trackingLinks: TrackingLink[] = [
  {
    id: "trk-001",
    offerId: "off-shopee-fashion",
    url: "https://vaffiliate.vn/go/shopee?ref=demo-user&click_id=trk-001",
    shortCode: "VAF001",
    createdAt: "2026-06-01",
  },
  {
    id: "trk-002",
    offerId: "off-shopee-beauty",
    url: "https://vaffiliate.vn/go/shopee?ref=demo-user&click_id=trk-002",
    shortCode: "VAF002",
    createdAt: "2026-06-05",
  },
  {
    id: "trk-003",
    offerId: "off-tiktok-home",
    url: "https://vaffiliate.vn/go/tiktok-shop?ref=demo-user&click_id=trk-003",
    shortCode: "VAF003",
    createdAt: "2026-06-08",
  },
];

export const joinedOfferIds: OfferId[] = ["off-shopee-fashion"];

export const publisherProfile = {
  id: "pub-demo-user",
  status: "approved" as const,
  joinedCampaignIds: ["cmp-shopee-q2"],
  trackingLinkIds: ["trk-001", "trk-002", "trk-003"],
};

export const trackingLinkStats: TrackingLinkStatsMap = {
  "trk-001": {
    clicks: 1842,
    uniqueClicks: 1284,
    conversionCount: 96,
    commission: "12.480.000đ",
    metrics: { epc: 6775, aov: 0, conversionRate: 0.0521 },
  },
  "trk-002": {
    clicks: 968,
    uniqueClicks: 712,
    conversionCount: 41,
    commission: "6.870.000đ",
    metrics: { epc: 7097, aov: 0, conversionRate: 0.0424 },
  },
  "trk-003": {
    clicks: 1245,
    uniqueClicks: 902,
    conversionCount: 58,
    commission: "4.980.000đ",
    metrics: { epc: 4000, aov: 0, conversionRate: 0.0466 },
  },
};

export const offerDestinationUrls: Record<OfferId, string> = {
  "off-shopee-fashion": "https://shopee.vn/Th%E1%BB%9Di-trang-Nam-cat.11013447",
  "off-shopee-beauty": "https://shopee.vn/Lam-dep-cat.11013328",
  "off-tiktok-home": "https://www.tiktok.com/shop/gia-dung",
};

export const offerTrackingParameters: Record<OfferId, {
  label: string;
  value: string;
}[]> = {
  "off-shopee-fashion": [
    { label: "ref", value: "demo-user" },
    { label: "click_id", value: "trk-001" },
    { label: "campaign_id", value: "cmp-shopee-q2" },
  ],
  "off-shopee-beauty": [
    { label: "ref", value: "demo-user" },
    { label: "click_id", value: "trk-002" },
    { label: "campaign_id", value: "cmp-shopee-q2" },
  ],
  "off-tiktok-home": [
    { label: "ref", value: "demo-user" },
    { label: "click_id", value: "trk-003" },
    { label: "campaign_id", value: "cmp-tiktok-launch" },
  ],
};

export const offerRequirements: Record<OfferId, OfferRequirement[]> = {
  "off-shopee-fashion": [
    { label: "Loại traffic", value: "Blog, mạng xã hội, email marketing" },
    { label: "Quốc gia nhắm đến", value: "Việt Nam" },
    { label: "Ngành hàng", value: "Thời trang" },
    { label: "Lưu ý tuân thủ", value: "Không chạy từ khóa brand Shopee" },
  ],
  "off-shopee-beauty": [
    { label: "Loại traffic", value: "Beauty blogger, mạng xã hội" },
    { label: "Quốc gia nhắm đến", value: "Việt Nam" },
    { label: "Ngành hàng", value: "Làm đẹp" },
    { label: "Lưu ý tuân thủ", value: "Hạn chế cashback layer trùng publisher" },
  ],
  "off-tiktok-home": [
    { label: "Loại traffic", value: "TikTok creator, livestream" },
    { label: "Quốc gia nhắm đến", value: "Việt Nam" },
    { label: "Ngành hàng", value: "Gia dụng" },
    { label: "Lưu ý tuân thủ", value: "Cần gắn tag #quangcao trong video" },
  ],
};

export const offerTrackingRules: Record<OfferId, OfferTrackingRules> = {
  "off-shopee-fashion": {
    cookieDurationDays: 7,
    allowedChannels: ["Blog cá nhân", "Facebook Page", "Email"],
    trafficRules: [
      "Không dùng từ khóa chứa brand Shopee trên Google Ads",
      "Cấm cookie stuffing hoặc traffic giả mạo",
    ],
  },
  "off-shopee-beauty": {
    cookieDurationDays: 7,
    allowedChannels: ["Instagram", "TikTok", "YouTube Review"],
    trafficRules: [
      "Không đặt link trong nội dung người lớn",
      "Cần cập nhật creative mỗi 30 ngày",
    ],
  },
  "off-tiktok-home": {
    cookieDurationDays: 14,
    allowedChannels: ["TikTok organic", "TikTok Shop live", "Cross-promo"],
    trafficRules: [
      "Bắt buộc hiển thị nhãn quảng cáo khi sử dụng paid traffic",
      "Cấm self-conversion qua tài khoản cá nhân",
    ],
  },
};

export const conversions: Conversion[] = [
  {
    id: "cnv-001",
    trackingLinkId: "trk-001",
    status: "approved",
    orderValue: "879.000đ",
    occurredAt: "2026-06-02",
  },
  {
    id: "cnv-002",
    trackingLinkId: "trk-002",
    status: "pending",
    orderValue: "520.000đ",
    occurredAt: "2026-06-06",
  },
  {
    id: "cnv-003",
    trackingLinkId: "trk-003",
    status: "paid",
    orderValue: "1.290.000đ",
    occurredAt: "2026-06-09",
  },
];
