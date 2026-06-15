import type {
  Advertiser,
  Campaign,
  Conversion,
  Offer,
  TrackingLink,
} from "@/types/affiliate";

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
