import type { PopularOffer } from "@/types/dashboard";
import type { HeroPreview, HomeFeature, HomeMetric, DashboardSummary, QuickAction } from "@/types/dashboard";

/**
 * Home metrics shown on the public homepage (`/`).
 *
 * These are intentionally qualitative, NOT numeric. Buyer-facing
 * copy must not show hard-coded cashback totals, order counts,
 * member counts, or activity metrics unless they are clearly
 * sourced from real public aggregate data. Today we have no such
 * aggregate, so the homepage advertises the *shape* of the system
 * (Hoàn tiền dự kiến / Theo dõi đơn / Sàn đang hỗ trợ) rather
 * than fake-looking numbers. The CTAs and feature copy below
 * remain unchanged.
 */
export const homeMetrics: HomeMetric[] = [
  {
    label: "Hoàn tiền dự kiến",
    value: "Theo chương trình đang áp dụng",
    note: "Số tiền hoàn cuối cùng phụ thuộc đối soát từ đối tác.",
  },
  {
    label: "Theo dõi đơn",
    value: "Đối soát rõ ràng từ đối tác",
    note: "Tiền hoàn chỉ được cộng vào ví sau khi đơn được ghi nhận và hoa hồng được duyệt.",
  },
  {
    label: "Sàn đang hỗ trợ",
    value: "Shopee",
    note: "Shopee đang hoạt động; các sàn khác sẽ được cập nhật sau. Dữ liệu hoàn tiền phụ thuộc đối soát từ đối tác.",
  },
];

export const homeFeatures: HomeFeature[] = [
  {
    title: "Lấy link hoàn tiền",
    description:
      "Chọn Shopee để lấy link hoàn tiền từ Vaffiliate và mua hàng như bình thường. TikTok Shop sẽ được cập nhật sau khi luồng theo dõi và đối soát hoàn tất.",
  },
  { title: "Chờ sàn ghi nhận", description: "Đơn hàng cần được ghi nhận, đối soát và duyệt hoa hồng trước khi tiền hoàn khả dụng." },
  { title: "Nhận tiền hoàn", description: "Vaffiliate trích một phần hoa hồng được duyệt để cộng vào ví hoàn tiền của bạn." },
];

/**
 * Phone preview shown on the public homepage.
 *
 * The `balance`, `monthlyCashback`, and numeric-looking strings
 * here used to be hard-coded demo numbers ("2.450.000đ",
 * "+186.000đ"). They are NOT sourced from real public aggregate
 * data and must not appear on a buyer-facing public surface.
 * The values below are qualitative placeholders that match the
 * shape of the actual wallet screen (logged-in user), without
 * claiming any specific amount. The CTA chips, layout, and
 * upcoming-store note remain unchanged.
 */
export const heroPreview: HeroPreview = {
  balance: "Cá nhân hoá sau khi đăng nhập",
  monthlyCashback: "Hoàn tiền dự kiến theo chương trình",
  upcomingPayout: "Tiền hoàn sẽ khả dụng sau khi đơn được ghi nhận, đối soát và duyệt hoa hồng.",
  stores: ["Shopee"],
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
