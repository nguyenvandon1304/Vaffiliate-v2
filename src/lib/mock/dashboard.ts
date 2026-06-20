import type { PopularOffer } from "@/types/dashboard";
import type { HeroPreview, HomeFeature, HomeMetric, DashboardSummary, QuickAction } from "@/types/dashboard";

export const homeMetrics: HomeMetric[] = [
  { label: "Hoàn tiền tháng này", value: "12,4 triệuđ" },
  { label: "Đơn đang ghi nhận", value: "8.320+" },
  { label: "Sàn đang hỗ trợ", value: "2", note: "Shopee và TikTok Shop đang hoạt động. Shopee Food, Lazada, Tiki và Sendo sẽ được cập nhật sau." },
];

export const homeFeatures: HomeFeature[] = [
  { title: "Lấy link hoàn tiền", description: "Chọn Shopee hoặc TikTok Shop, lấy link affiliate từ Vaffiliate và mua hàng như bình thường." },
  { title: "Chờ sàn ghi nhận", description: "Đơn hàng cần được ghi nhận, đối soát và duyệt hoa hồng trước khi tiền hoàn khả dụng." },
  { title: "Nhận tiền hoàn", description: "Vaffiliate trích một phần hoa hồng được duyệt để cộng vào ví hoàn tiền của bạn." },
];

export const heroPreview: HeroPreview = {
  balance: "2.450.000đ",
  monthlyCashback: "+186.000đ",
  upcomingPayout: "Tiền hoàn sẽ khả dụng sau khi đơn được ghi nhận, đối soát và duyệt hoa hồng.",
  stores: ["Shopee", "TikTok Shop"],
  upcomingStores: ["Shopee Food", "Lazada", "Tiki", "Sendo"],
};

export const dashboardSummary: DashboardSummary = {
  greeting: "Chào buổi tối, Minh",
  title: "Ví hoàn tiền của bạn",
  description: "Theo dõi số dư, đơn ghi nhận và khoản hoàn tiền đang chờ đối soát.",
  availableCashback: "245.000đ",
  pendingCashback: "128.000đ",
  trackedOrders: "16 đơn",
  tier: "Hạng Bạc",
  nextPayout: "Tiền hoàn sẽ khả dụng sau khi đơn được ghi nhận và hoa hồng được sàn duyệt.",
  activePlatforms: ["Shopee", "TikTok Shop"],
  upcomingPlatforms: ["Shopee Food", "Lazada", "Tiki", "Sendo"],
};

export const quickActions: QuickAction[] = [
  { title: "Lấy link", subtitle: "Lấy link hoàn tiền", icon: "↗" },
  { title: "Rút tiền", subtitle: "Về tài khoản", icon: "₫" },
  { title: "Đơn hàng", subtitle: "Xem chi tiết", icon: "◫" },
];

export const popularOffers: PopularOffer[] = [
  {
    offerId: "off-shopee-fashion",
    platform: "Shopee",
    title: "Thời trang Shopee",
    rewardLabel: "8% hoàn tiền",
    category: "Thời trang",
    description: "Áp dụng cho ngành thời trang nam và nữ.",
  },
  {
    offerId: "off-shopee-beauty",
    platform: "Shopee",
    title: "Làm đẹp Shopee",
    rewardLabel: "10% hoàn tiền",
    category: "Làm đẹp",
    description: "Mỹ phẩm, chăm sóc da và sức khỏe.",
  },
  {
    offerId: "off-tiktok-home",
    platform: "TikTok Shop",
    title: "Đồ gia dụng TikTok",
    rewardLabel: "6% hoàn tiền",
    category: "Gia dụng",
    description: "Đồ gia dụng, nhà bếp và nội thất.",
  },
];
