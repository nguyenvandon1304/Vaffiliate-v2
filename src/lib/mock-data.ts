import type { CashbackPlatform } from "@/types/cashback";
import type { DashboardSummary, HomeFeature, HomeMetric, HeroPreview, QuickAction } from "@/types/dashboard";
import type { FinanceTransaction } from "@/types/finance";
import type { MoreMenuItem } from "@/types/user";
import type { RecentOrder } from "@/types/orders";

export const homeMetrics: HomeMetric[] = [
  {
    label: "Hoàn tiền tháng này",
    value: "12,4 triệuđ",
  },
  {
    label: "Đơn đang ghi nhận",
    value: "8.320+",
  },
  {
    label: "Sàn đang hỗ trợ",
    value: "2",
    note: "Shopee và TikTok Shop đang hoạt động. Shopee Food, Lazada, Tiki và Sendo sẽ được cập nhật sau.",
  },
];

export const homeFeatures: HomeFeature[] = [
  {
    title: "Lấy link hoàn tiền",
    description:
      "Chọn Shopee hoặc TikTok Shop, lấy link affiliate từ Vaffiliate và mua hàng như bình thường.",
  },
  {
    title: "Chờ sàn ghi nhận",
    description:
      "Đơn hàng cần được ghi nhận, đối soát và duyệt hoa hồng trước khi tiền hoàn khả dụng.",
  },
  {
    title: "Nhận tiền hoàn",
    description:
      "Vaffiliate trích một phần hoa hồng được duyệt để cộng vào ví hoàn tiền của bạn.",
  },
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
  description:
    "Theo dõi số dư, đơn ghi nhận và khoản hoàn tiền đang chờ đối soát.",
  availableCashback: "245.000đ",
  pendingCashback: "128.000đ",
  trackedOrders: "16 đơn",
  tier: "Hạng Bạc",
  nextPayout: "Tiền hoàn sẽ khả dụng sau khi đơn được ghi nhận và hoa hồng được sàn duyệt.",
  activePlatforms: ["Shopee", "TikTok Shop"],
  upcomingPlatforms: ["Shopee Food", "Lazada", "Tiki", "Sendo"],
};

export const quickActions: QuickAction[] = [
  {
    title: "Lấy link",
    subtitle: "Lấy link hoàn tiền",
    icon: "↗",
  },
  {
    title: "Rút tiền",
    subtitle: "Về tài khoản",
    icon: "₫",
  },
  {
    title: "Đơn hàng",
    subtitle: "Xem chi tiết",
    icon: "◫",
  },
];

export const recentOrders: RecentOrder[] = [
  {
    store: "Shopee",
    item: "Máy sấy tóc ion âm",
    status: "Đã ghi nhận",
    amount: "+18.000đ",
    total: "879.000đ",
    time: "2 giờ trước",
  },
  {
    store: "TikTok Shop",
    item: "Kem chống nắng SPF50",
    status: "Chờ đối soát",
    amount: "+26.000đ",
    total: "520.000đ",
    time: "Hôm qua",
  },
  {
    store: "Shopee",
    item: "Tai nghe không dây",
    status: "Đã duyệt hoa hồng",
    amount: "+54.000đ",
    total: "1.290.000đ",
    time: "3 ngày trước",
  },
  {
    store: "TikTok Shop",
    item: "Bình giữ nhiệt inox",
    status: "Có thể rút",
    amount: "+22.000đ",
    total: "339.000đ",
    time: "5 ngày trước",
  },
  {
    store: "Shopee",
    item: "Áo thun thể thao",
    status: "Từ chối",
    amount: "+0đ",
    total: "199.000đ",
    time: "1 tuần trước",
  },
];

export const cashbackPlatforms: CashbackPlatform[] = [
  {
    name: "Shopee",
    description: "Lấy link hoàn tiền và mua sắm như bình thường trên Shopee.",
    cta: "Lấy link hoàn tiền",
  },
  {
    name: "TikTok Shop",
    description:
      "Mua sắm qua link TikTok Shop và nhận hoàn tiền sau khi đơn được ghi nhận, hoa hồng được duyệt.",
    cta: "Lấy link hoàn tiền",
  },
];

export const orderFilters = [
  "Tất cả",
  "Đã ghi nhận",
  "Chờ đối soát",
  "Đã duyệt hoa hồng",
  "Có thể rút",
  "Từ chối",
];

export const financeSummary = [
  {
    label: "Có thể rút",
    value: "245.000đ",
  },
  {
    label: "Chờ đối soát",
    value: "128.000đ",
  },
  {
    label: "Tổng đã rút",
    value: "1.420.000đ",
  },
];

export const financeTransactions: FinanceTransaction[] = [
  {
    title: "Rút tiền về tài khoản",
    amount: "-500.000đ",
    time: "06/06/2026",
    status: "Hoàn tất",
  },
  {
    title: "Hoa hồng được duyệt",
    amount: "+54.000đ",
    time: "04/06/2026",
    status: "Đã cộng ví",
  },
  {
    title: "Tiền hoàn chờ đối soát",
    amount: "+26.000đ",
    time: "03/06/2026",
    status: "Tạm giữ",
  },
];

export const moreMenuItems: MoreMenuItem[] = [
  {
    title: "Mời bạn bè",
    subtitle: "Nhận thêm quyền lợi khi bạn bè mua hàng hợp lệ.",
  },
  {
    title: "Cấp bậc & quyền lợi",
    subtitle: "Theo dõi cấp bậc và quyền lợi hoàn tiền.",
  },
  {
    title: "Hướng dẫn nhận hoàn tiền",
    subtitle: "Các bước lấy link và mua hàng đúng cách.",
  },
  {
    title: "Điều kiện đơn hợp lệ",
    subtitle: "Những trường hợp đơn được ghi nhận hoặc bị từ chối.",
  },
  {
    title: "Hồ sơ",
    subtitle: "Thông tin cá nhân và tài khoản nhận tiền.",
  },
  {
    title: "Cài đặt",
    subtitle: "Thông báo, bảo mật và tuỳ chọn ứng dụng.",
  },
];
