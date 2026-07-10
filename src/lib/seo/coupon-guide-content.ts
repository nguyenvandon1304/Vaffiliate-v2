/**
 * Phase 20I.7 -- public coupon / cashback guide content module.
 *
 * Pure-data foundation for the buyer-facing guide that ships on
 * `/ma-giam-gia` and `/ma-giam-gia/shopee`. The guide explains
 * the four concepts the platform mixes up most often:
 *
 *   1. Mã giảm giá (voucher code) -- only when the vendor feed
 *      actually carries a code. The platform never synthesises
 *      a code from a Shopee link, an id, or a short code.
 *   2. Ưu đãi / deal link -- affiliate outbound link with no
 *      copy-paste code.
 *   3. Hoàn tiền dự kiến (estimated cashback) -- a number that
 *      can change until the order reconciles.
 *   4. Hoàn tiền đã xác nhận -- what actually shows in the
 *      balance after partner reconciliation confirms the order.
 *
 * Copy rules (mirrors the Phase 20I.6 `policy-content.ts`
 * guard):
 *
 *   - No "cam kết", "đảm bảo", "chắc chắn", "mua là có hoàn
 *     tiền", "100% được duyệt", or "Google sẽ đề xuất".
 *   - No internal ids (`networkSubId`, `trackingLinkId`,
 *     `publisherId`, `shortCode`, `clickId`, ...).
 *   - Allowed wording: "dự kiến", "ước tính", "chỉ xác nhận
 *     sau khi đối soát hợp lệ", "có thể thay đổi theo điều
 *     kiện chương trình", "Vaffiliate không phải Shopee",
 *     "kiểm tra điều kiện trước khi mua".
 *
 * The data is exported as a typed object so individual sections
 * can be reused on different routes. The full guide is rendered
 * on `/ma-giam-gia`; a Shopee-scoped subset is rendered on
 * `/ma-giam-gia/shopee`.
 */

export type GuideSection = {
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
  readonly bullets?: ReadonlyArray<string>;
};

export type GuideFaqItem = {
  readonly question: string;
  readonly answer: string;
};

/**
 * The full coupon / cashback guide surfaces six sections plus an
 * FAQ. Each section deliberately uses safe phrasing (see header
 * comments). The `bullets` field, when present, is rendered as a
 * compact list under the paragraph.
 */
export const COUPON_GUIDE_SECTIONS: ReadonlyArray<GuideSection> = [
  {
    heading: "Cách dùng mã giảm giá Shopee",
    paragraphs: [
      "Vaffiliate nhóm mã giảm giá và ưu đãi theo sàn để bạn tra cứu nhanh hơn. Khi một sản phẩm / chương trình đi kèm mã giảm giá thật từ đối tác, nút bấm sẽ là 'Sao chép mã': sao chép mã, mở Shopee, dán vào ô 'Mã của Shop' trước khi thanh toán.",
      "Một số ưu đãi không có mã vì chương trình được kích hoạt khi bạn truy cập Shopee qua liên kết của Vaffiliate. Trong trường hợp đó, nút bấm sẽ là 'Mở ưu đãi' thay vì 'Sao chép mã'.",
    ],
    bullets: [
      "Sao chép mã chỉ xuất hiện khi đối tác cung cấp mã thật.",
      "Mở ưu đãi là cách dùng phổ biến nhất cho deal Shopee không kèm mã.",
      "Luôn kiểm tra điều kiện đơn hàng (giá trị tối thiểu, sản phẩm áp dụng, thời hạn) trước khi thanh toán.",
    ],
  },
  {
    heading: "Cách kiểm tra ưu đãi có mã hay chỉ là deal",
    paragraphs: [
      "Trong danh sách ưu đãi, mỗi thẻ hiển thị rõ nhãn nút bấm: 'Sao chép mã' nghĩa là có mã giảm giá để bạn sao chép; 'Mở ưu đãi' nghĩa là ưu đãi kích hoạt khi bạn truy cập Shopee qua liên kết của Vaffiliate; 'Xem điều kiện hoàn tiền' dành cho chương trình hoàn tiền Shopee.",
      "Khi một ưu đãi cần kết hợp cả mã lẫn điều kiện chương trình, Vaffiliate không tự sinh mã từ liên kết sản phẩm hoặc từ mã ngắn. Nếu thẻ không có nút 'Sao chép mã', nghĩa là đối tác không cung cấp mã cho chương trình đó.",
    ],
  },
  {
    heading: "Hoàn tiền Shopee hoạt động như thế nào",
    paragraphs: [
      "Hoàn tiền trên Vaffiliate là phần hoa hồng affiliate mà Vaffiliate nhận từ Shopee (hoặc đối tác báo cáo tương đương) và chia lại cho bạn. Số tiền hiển thị khi bạn truy cập ưu đãi chỉ là con số ước tính theo chương trình đang áp dụng tại thời điểm đó.",
      "Khi đơn hàng được Shopee / đối tác ghi nhận hợp lệ, dữ liệu đối soát sẽ quay về Vaffiliate. Khoản hoàn tiền chỉ được cộng vào số dư khả dụng của bạn sau khi quá trình đối soát hoàn tất, không phải ngay khi đặt hàng.",
    ],
  },
  {
    heading: "Vì sao hoàn tiền có thể không phát sinh",
    paragraphs: [
      "Có những trường hợp phổ biến khiến hoàn tiền không phát sinh hoặc bị từ chối: đơn bị hủy hoặc hoàn trả; bạn truy cập Shopee qua một kênh khác trước khi hoàn tất đơn; voucher / mã khuyến mãi khác không tương thích với chương trình affiliate đang áp dụng; hoặc đối tác không gửi dữ liệu đối soát trong thời hạn cho phép.",
      "Trong những trường hợp đó, Vaffiliate không ghi nhận hoàn tiền cho đơn đó. Khi có tranh chấp, bạn có thể liên hệ hỗ trợ kèm mã đơn hàng để Vaffiliate đối chiếu với dữ liệu đối tác.",
    ],
  },
  {
    heading: "Lưu ý khi dùng voucher và cashback cùng lúc",
    paragraphs: [
      "Voucher của Shopee và chương trình affiliate có thể cộng dồn hoặc không, tùy chính sách riêng của mỗi chương trình. Vaffiliate không quyết định việc mọi voucher có được cộng dồn với hoàn tiền hay không, vì quyết định cuối cùng thuộc về Shopee và đối tác báo cáo.",
      "Mẹo nhỏ khi mua: nếu bạn có cả voucher lẫn liên kết hoàn tiền, hãy đọc điều kiện chương trình trước khi áp dụng mã. Đôi khi mã 'giảm giá sâu' sẽ khiến đơn không còn thuộc nhóm được cộng thêm hoa hồng affiliate.",
    ],
  },
  {
    heading: "Câu hỏi thường gặp",
    paragraphs: [
      "Mục này gom các câu hỏi người mua thường hỏi về mã giảm giá, hoàn tiền và quan hệ giữa Vaffiliate với Shopee. Câu trả lời chỉ mang tính nền (foundation) và sẽ được cập nhật theo thực tế vận hành.",
    ],
  },
];

/**
 * FAQ items rendered under the "Câu hỏi thường gặp" section.
 *
 * Each answer keeps the same safe wording rule as the policy
 * copy: describe states, never guarantee outcomes.
 */
export const COUPON_GUIDE_FAQS: ReadonlyArray<GuideFaqItem> = [
  {
    question: "Mã giảm giá Shopee có lúc nào cũng dùng được không?",
    answer:
      "Không. Mỗi mã đi kèm điều kiện riêng (giá trị đơn tối thiểu, nhóm sản phẩm áp dụng, thời hạn). Khi mã không còn hiệu lực, Shopee sẽ thông báo ngay trong bước thanh toán.",
  },
  {
    question: "Hoàn tiền hiển thị trên Vaffiliate là số cuối cùng tôi nhận được chứ?",
    answer:
      "Không. Số hiển thị khi bạn truy cập ưu đãi là ước tính theo chương trình tại thời điểm đó. Số tiền cuối cùng chỉ được cộng vào số dư khả dụng sau khi đối soát thành công với dữ liệu từ đối tác.",
  },
  {
    question: "Vaffiliate có phải Shopee không?",
    answer:
      "Không. Vaffiliate không phải Shopee, cũng không phải TikTok Shop, Lazada, Tiki hay bất kỳ sàn thương mại điện tử nào khác. Vaffiliate chỉ là nền tảng trung gian ghi nhận và đối soát hoa hồng affiliate để chia lại một phần cho bạn dưới dạng hoàn tiền.",
  },
  {
    question: "Sao chép mã có luôn áp dụng được không?",
    answer:
      "Mã được 'Sao chép mã' từ Vaffiliate là mã thật do đối tác cung cấp. Việc áp dụng mã cuối cùng vẫn tuân theo điều kiện của Shopee tại thời điểm thanh toán, Vaffiliate không can thiệp vào quyết định này.",
  },
  {
    question: "Một đơn Shopee có thể vừa dùng mã vừa được hoàn tiền không?",
    answer:
      "Có thể, tùy chương trình đang áp dụng. Vaffiliate không can thiệp chính sách Shopee; vui lòng kiểm tra điều kiện chương trình và điều khoản hoàn tiền trước khi mua.",
  },
  {
    question: "Hoàn tiền có thể bị từ chối không?",
    answer:
      "Có. Đơn hủy / hoàn trả, sai chương trình, hoặc không nhận được dữ liệu đối soát từ đối tác đều có thể khiến hoàn tiền không phát sinh. Xem chi tiết tại trang Điều khoản hoàn tiền.",
  },
];

/**
 * Shopee-scoped subset for `/ma-giam-gia/shopee`. Re-uses the
 * general sections but only includes the FAQ rows that are
 * meaningful for a Shopee audience.
 */
export const SHOPEE_GUIDE_FAQS: ReadonlyArray<GuideFaqItem> =
  COUPON_GUIDE_FAQS;
