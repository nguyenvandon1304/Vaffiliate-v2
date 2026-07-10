/**
 * Phase 20I.6 -- shared policy / legal content foundation.
 *
 * Centralised copy for the public privacy, terms, cashback-terms
 * and data-deletion pages. Living as pure data (NOT a React
 * component) so the same strings can be:
 *
 *   - rendered by the server components at `/privacy`,
 *     `/terms`, `/cashback-terms` and `/data-deletion`,
 *   - unit-tested for copy safety (no forbidden wording, no
 *     buyer-facing internal tokens, no overpromise).
 *
 * IMPORTANT -- what this file IS and IS NOT:
 *
 *   - It is FOUNDATION copy. It is intentionally written in
 *     everyday Vietnamese so the average buyer can read it.
 *   - It is NOT legal advice and must be reviewed by counsel
 *     before any production store submission. The pages expose
 *     this explicitly via the `foundationNote` field.
 *   - It does NOT include any internal identifiers (raw tracking
 *     link id, click id, network sub id, Addlivetag account id,
 *     publisher id, etc.). Only generic categories.
 *   - It does NOT promise guaranteed cashback. Cashback is always
 *     described as "estimated" / "pending reconciliation" /
 *     "confirmed" / "available", never "guaranteed".
 *
 * Adding a new page:
 *   - Add a new exported constant below with the same shape.
 *   - Add a regression test in `policy-content.test.ts` covering
 *     every entry that names a sensitive word ("cam kết", "chắc
 *     chắn", "đảm bảo", etc.) so copy drift is caught.
 */

export type PolicyLink = {
  /** Internal path, e.g. "/privacy". */
  readonly href: string;
  /** Buyer-facing label. */
  readonly label: string;
};

export type PolicySection = {
  /** Buyer-facing heading. */
  readonly heading: string;
  /** Body paragraphs. Each entry is one paragraph (joined with `\n\n`). */
  readonly paragraphs: ReadonlyArray<string>;
};

export type PolicyPage = {
  /** Short slug, used as a key + path: "/privacy" -> slug "privacy". */
  readonly slug: "privacy" | "terms" | "cashback-terms" | "data-deletion";
  /** Full public path. */
  readonly path: string;
  /** SEO title (will be wrapped with " | Vaffiliate" by the page). */
  readonly title: string;
  /** SEO / OG description. Plain Vietnamese, no internal tokens. */
  readonly description: string;
  /** Lead paragraph shown under the H1. */
  readonly lead: string;
  /** Body sections in render order. */
  readonly sections: ReadonlyArray<PolicySection>;
  /**
   * Final "foundation" note shown at the bottom of every page.
   * Explicitly tells the user this is foundation copy and must
   * be reviewed before relying on it as legal terms.
   */
  readonly foundationNote: string;
  /** Optional list of related policy links shown at the bottom. */
  readonly relatedLinks: ReadonlyArray<PolicyLink>;
};

/**
 * /privacy -- privacy policy foundation.
 *
 * Lists the categories of data Vaffiliate MAY process, the
 * purposes, the absence of advertising-data selling, and the
 * user's deletion path. Does not name any internal id field.
 */
export const PRIVACY_POLICY: PolicyPage = {
  slug: "privacy",
  path: "/privacy",
  title: "Chính sách quyền riêng tư",
  description:
    "Cách Vaffiliate xử lý dữ liệu tài khoản, dữ liệu đơn hàng và dữ liệu đối soát hoàn tiền.",
  lead: "Trang này mô tả các loại dữ liệu Vaffiliate có thể xử lý khi bạn sử dụng dịch vụ hoàn tiền, mục đích xử lý và cách bạn có thể yêu cầu xóa hoặc ẩn danh hóa dữ liệu của mình.",
  sections: [
    {
      heading: "Các loại dữ liệu có thể được xử lý",
      paragraphs: [
        "Để vận hành tài khoản và ghi nhận hoàn tiền, Vaffiliate có thể xử lý các nhóm dữ liệu sau:",
        "Dữ liệu tài khoản: địa chỉ email, mã định danh tài khoản nội bộ và thông tin bạn cung cấp khi đăng ký hoặc cập nhật hồ sơ.",
        "Dữ liệu xác thực và phiên đăng nhập: cookie phiên, token phiên và thông tin cần thiết để duy trì trạng thái đăng nhập an toàn.",
        "Dữ liệu đơn hàng và bằng chứng hoàn tiền: thông tin đơn hàng, mã đơn, ngày phát sinh đơn, giá trị đơn và trạng thái đối soát.",
        "Dữ liệu bấm chuột và ghi nhận nguồn: thông tin tối thiểu cần thiết để ghi nhận rằng bạn truy cập sàn thông qua Vaffiliate, đủ để đối soát hoa hồng nhưng không bao gồm hành vi duyệt web ngoài ứng dụng.",
        "Dữ liệu giao dịch và rút tiền trong tương lai: khi chức năng rút tiền được mở, Vaffiliate sẽ xử lý thông tin tài khoản nhận tiền do bạn cung cấp và lịch sử giao dịch liên quan.",
        "Dữ liệu hỗ trợ, quản trị và kiểm toán nội bộ: các yêu cầu hỗ trợ bạn gửi, nhật ký truy cập khu vực quản trị và nhật ký thao tác nội bộ phục vụ kiểm tra an toàn.",
        "Dữ liệu kỹ thuật: địa chỉ IP rút gọn, thời điểm truy cập, loại thiết bị và trình duyệt ở mức cần thiết để vận hành, chống gian lận và cải thiện dịch vụ.",
        "Dữ liệu nhận từ đối tác: Vaffiliate có thể nhận dữ liệu đơn hàng, dữ liệu hoa hồng hoặc bằng chứng đối soát từ các đối tác affiliate và báo cáo như Shopee, Addlivetag hoặc đối tác tương đương trong tương lai.",
      ],
    },
    {
      heading: "Mục đích xử lý",
      paragraphs: [
        "Vaffiliate xử lý dữ liệu ở trên cho các mục đích: vận hành tài khoản và phiên đăng nhập của bạn; ghi nhận, đối soát và xác nhận hoàn tiền; chống gian lận và lạm dụng; hỗ trợ khách hàng; tuân thủ nghĩa vụ pháp lý và kế toán nếu có; và cải thiện chất lượng dịch vụ.",
        "Vaffiliate không bán dữ liệu cá nhân của bạn cho bên quảng cáo. Vaffiliate cũng không dùng dữ liệu cá nhân để phục vụ quảng cáo hành vi xuyên ứng dụng của bên thứ ba trong phạm vi chính sách này.",
      ],
    },
    {
      heading: "Chia sẻ dữ liệu",
      paragraphs: [
        "Dữ liệu có thể được chia sẻ với: nhà cung cấp dịch vụ kỹ thuật (lưu trữ, gửi email, xác thực); đối tác affiliate và báo cáo (chỉ phần dữ liệu cần thiết để đối soát hoa hồng); cơ quan nhà nước có thẩm quyền khi có yêu cầu hợp pháp.",
        "Vaffiliate chỉ chia sẻ ở mức tối thiểu cần thiết cho mỗi mục đích nêu trên.",
      ],
    },
    {
      heading: "Lưu giữ và xóa dữ liệu",
      paragraphs: [
        "Một số dữ liệu có thể cần được lưu giữ trong thời gian cần thiết để đối soát, chống gian lận hoặc đáp ứng nghĩa vụ pháp lý và kế toán nếu có, ngay cả khi bạn đã yêu cầu xóa tài khoản. Sau thời hạn đó, dữ liệu sẽ được xóa hoặc ẩn danh hóa.",
        "Để yêu cầu xóa hoặc ẩn danh hóa dữ liệu, vui lòng xem trang Xóa dữ liệu hoặc mục Xóa tài khoản trong khu vực tài khoản của bạn.",
      ],
    },
    {
      heading: "Quyền của bạn",
      paragraphs: [
        "Bạn có thể cập nhật thông tin hồ sơ trong khu vực tài khoản, yêu cầu truy xuất dữ liệu cá nhân mà Vaffiliate đang xử lý và yêu cầu xóa hoặc ẩn danh hóa dữ liệu khi đủ điều kiện.",
        "Nếu bạn có câu hỏi về quyền riêng tư, vui lòng liên hệ đội ngũ vận hành Vaffiliate.",
      ],
    },
  ],
  foundationNote:
    "Đây là bản nền (foundation) của chính sách quyền riêng tư, được biên soạn để chuẩn bị cho việc niêm yết trên cửa hàng ứng dụng trong tương lai. Nội dung này cần được rà soát bởi cố vấn pháp lý trước khi được coi là điều khoản pháp lý chính thức.",
  relatedLinks: [
    { href: "/terms", label: "Điều khoản dịch vụ" },
    { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
    { href: "/data-deletion", label: "Xóa dữ liệu" },
  ],
};

/**
 * /terms -- terms of service foundation.
 */
export const TERMS_POLICY: PolicyPage = {
  slug: "terms",
  path: "/terms",
  title: "Điều khoản dịch vụ",
  description:
    "Điều khoản sử dụng nền tảng Vaffiliate và quan hệ giữa Vaffiliate với người dùng cuối.",
  lead: "Trang này mô tả các điều khoản nền tảng khi bạn sử dụng Vaffiliate. Bằng việc sử dụng dịch vụ, bạn đồng ý tuân thủ các điều khoản này ở mức nền tảng; nội dung cần được rà soát bởi cố vấn pháp lý trước khi được coi là điều khoản pháp lý chính thức.",
  sections: [
    {
      heading: "Về Vaffiliate",
      paragraphs: [
        "Vaffiliate là nền tảng trung gian kết nối người mua với các chương trình affiliate và cashback của bên thứ ba. Vaffiliate không phải Shopee, TikTok Shop, Lazada, Tiki hay bất kỳ sàn thương mại điện tử nào khác, và không sở hữu vận hành các sàn đó.",
        "Mọi giao dịch mua hàng phát sinh qua Vaffiliate đều là giao dịch giữa bạn và sàn thương mại điện tử hoặc nhà bán; Vaffiliate chỉ hỗ trợ ghi nhận và đối soát hoa hồng để hoàn tiền cho bạn.",
      ],
    },
    {
      heading: "Điều kiện sử dụng",
      paragraphs: [
        "Bạn phải tuân thủ điều kiện của chương trình affiliate, điều kiện sàn thương mại điện tử và pháp luật hiện hành khi sử dụng Vaffiliate.",
        "Bạn chịu trách nhiệm về tính chính xác của thông tin tài khoản, tài khoản nhận tiền và các thông tin bạn cung cấp cho Vaffiliate.",
        "Bạn không được sử dụng Vaffiliate cho mục đích gian lận, lạm dụng, tạo nhiều tài khoản để trục lợi hoặc bất kỳ hành vi nào vi phạm pháp luật.",
      ],
    },
    {
      heading: "Hoàn tiền và đối soát",
      paragraphs: [
        "Hoàn tiền chỉ được xác nhận sau khi đối soát hợp lệ với dữ liệu mà sàn và đối tác báo cáo cung cấp.",
        "Không phải mọi đơn hàng đều phát sinh hoàn tiền. Vaffiliate có thể từ chối hoàn tiền khi đơn bị hủy, hoàn trả, không hợp lệ, có dấu hiệu gian lận hoặc khi không nhận được dữ liệu đối soát từ đối tác trong thời hạn cho phép.",
        "Số tiền hoàn tiền dự kiến hiển thị trên Vaffiliate chỉ là ước tính theo chương trình đang áp dụng tại thời điểm truy cập, có thể thay đổi theo chính sách của sàn hoặc đối tác.",
      ],
    },
    {
      heading: "Tài khoản và quyền của Vaffiliate",
      paragraphs: [
        "Vaffiliate có thể tạm khóa hoặc chấm dứt tài khoản nếu phát hiện hành vi vi phạm điều khoản, gian lận hoặc có yêu cầu hợp pháp từ cơ quan có thẩm quyền.",
        "Trong trường hợp tranh chấp, Vaffiliate sẽ ưu tiên dữ liệu đối soát nhận từ đối tác làm căn cứ; bạn có thể liên hệ hỗ trợ để cung cấp bằng chứng bổ sung.",
      ],
    },
  ],
  foundationNote:
    "Đây là bản nền (foundation) của điều khoản dịch vụ, được biên soạn để chuẩn bị cho việc niêm yết trên cửa hàng ứng dụng trong tương lai. Nội dung này cần được rà soát bởi cố vấn pháp lý trước khi được coi là điều khoản pháp lý chính thức.",
  relatedLinks: [
    { href: "/privacy", label: "Chính sách quyền riêng tư" },
    { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
    { href: "/data-deletion", label: "Xóa dữ liệu" },
  ],
};

/**
 * /cashback-terms -- cashback-specific terms.
 *
 * Distinguishes the four states the user actually sees in the
 * product: voucherCode, offer / product link, cashback estimate,
 * confirmed cashback, and payable / paid cashback. Forbids
 * overpromise.
 */
export const CASHBACK_TERMS_POLICY: PolicyPage = {
  slug: "cashback-terms",
  path: "/cashback-terms",
  title: "Điều khoản hoàn tiền",
  description:
    "Cách Vaffiliate phân loại trạng thái hoàn tiền, điều kiện được nhận và điều kiện bị từ chối hoàn tiền.",
  lead: "Trang này giải thích các trạng thái của hoàn tiền trên Vaffiliate và những điều kiện có thể khiến hoàn tiền bị từ chối hoặc không phát sinh.",
  sections: [
    {
      heading: "Các trạng thái hoàn tiền",
      paragraphs: [
        "Mã giảm giá / liên kết sản phẩm: là thông tin đầu vào để truy cập sàn. Mã hoặc liên kết chỉ phát huy tác dụng khi bạn mua đúng sản phẩm / chương trình đang áp dụng.",
        "Hoàn tiền dự kiến: là con số ước tính theo chương trình đang áp dụng tại thời điểm bạn truy cập. Con số này có thể thay đổi theo chính sách của sàn hoặc đối tác và không phải số tiền cuối cùng được xác nhận.",
        "Hoàn tiền đã xác nhận: là khoản đã được đối soát thành công với dữ liệu mà đối tác báo cáo. Chỉ ở trạng thái này khoản tiền mới được cộng vào số dư khả dụng của bạn.",
        "Hoàn tiền có thể rút: là phần thuộc số dư khả dụng đáp ứng điều kiện rút tiền theo cấu hình hiện tại của Vaffiliate (khi chức năng rút tiền được mở).",
      ],
    },
    {
      heading: "Điều kiện hoàn tiền không phát sinh",
      paragraphs: [
        "Bạn đổi sang liên kết khác hoặc truy cập sàn không qua phiên mua đã ghi nhận trước khi hoàn tất đơn.",
        "Đơn bị hủy, hoàn một phần, hoàn toàn hoặc không đáp ứng điều kiện chương trình.",
        "Sàn hoặc đối tác không ghi nhận giao dịch thuộc chương trình đang áp dụng, hoặc dữ liệu đối soát không khớp.",
        "Bạn sử dụng mã khuyến mãi, voucher hoặc ưu đãi khác không tương thích với chương trình affiliate đang áp dụng (nếu có).",
      ],
    },
    {
      heading: "Nguyên tắc xử lý của Vaffiliate",
      paragraphs: [
        "Nguyên tắc xử lý của Vaffiliate: hiển thị trung thực các trạng thái hoàn tiền theo dữ liệu hiện có; không ghi nhận hoàn tiền khi không có dữ liệu đối soát hợp lệ; hỗ trợ bạn cung cấp bằng chứng bổ sung khi có tranh chấp.",
        "Vaffiliate không xem mọi đơn hàng là đủ điều kiện hoàn tiền. Tỉ lệ hoàn tiền có thể thay đổi theo chính sách của sàn hoặc đối tác. Số tiền hoàn tiền cuối cùng được xác nhận chỉ được cộng vào số dư khả dụng sau khi đối soát thành công, không phải con số dự kiến.",
      ],
    },
  ],
  foundationNote:
    "Đây là bản nền (foundation) của điều khoản hoàn tiền, được biên soạn để chuẩn bị cho việc niêm yết trên cửa hàng ứng dụng trong tương lai. Nội dung này cần được rà soát bởi cố vấn pháp lý trước khi được coi là điều khoản pháp lý chính thức.",
  relatedLinks: [
    { href: "/terms", label: "Điều khoản dịch vụ" },
    { href: "/privacy", label: "Chính sách quyền riêng tư" },
    { href: "/data-deletion", label: "Xóa dữ liệu" },
  ],
};

/**
 * /data-deletion -- public data-deletion information page.
 *
 * Tells unauthenticated visitors how to request deletion and what
 * may need to be retained. Authenticated visitors get a CTA that
 * takes them into the user deletion flow.
 *
 * IMPORTANT about the deletion flow in Phase 20I.6:
 *
 *   - The submission form and admin queue ARE implemented as
 *     foundation.  They prove the UX / interaction / RBAC path.
 *   - The persistent storage / ops pipeline is NOT implemented.
 *     Requests go into an in-memory queue that resets on every
 *     server restart.
 *   - Copy MUST NOT imply a durable ops pipeline or production
 *     storage exists.  Keep the "bản nền" framing honest.
 */
export const DATA_DELETION_POLICY: PolicyPage = {
  slug: "data-deletion",
  path: "/data-deletion",
  title: "Xóa dữ liệu",
  description:
    "Cách yêu cầu xóa tài khoản và dữ liệu Vaffiliate, và những dữ liệu có thể cần được lưu giữ.",
  lead: "Trang này mô tả cách bạn có thể yêu cầu xóa tài khoản và dữ liệu cá nhân trên Vaffiliate, và những dữ liệu có thể cần được lưu giữ trong thời gian cần thiết theo quy định hiện hành.",
  sections: [
    {
      heading: "Yêu cầu xóa tài khoản",
      paragraphs: [
        "Nếu bạn đang đăng nhập, bạn có thể gửi yêu cầu xóa tài khoản ngay trong khu vực tài khoản của mình. Phase hiện tại chỉ cung cấp luồng nền để kiểm tra quy trình yêu cầu xóa tài khoản. Hệ thống lưu trữ bền vững cho yêu cầu xóa sẽ được kết nối ở phase sau trước khi gửi app lên cửa hàng.",
        "Nếu bạn chưa đăng nhập, vui lòng đăng nhập trước rồi vào lại trang này để gửi yêu cầu. Vaffiliate không xử lý yêu cầu xóa cho tài khoản không thể xác minh.",
      ],
    },
    {
      heading: "Dữ liệu có thể cần được lưu giữ",
      paragraphs: [
        "Một số dữ liệu có thể cần được lưu giữ trong thời gian cần thiết cho: đối soát hoa hồng và đơn hàng đang xử lý; chống gian lận và lạm dụng; đáp ứng nghĩa vụ pháp lý hoặc kế toán nếu có.",
      ],
    },
    {
      heading: "Sau khi yêu cầu được tiếp nhận",
      paragraphs: [
        "Khi yêu cầu được tiếp nhận trong luồng nền, tài khoản của bạn sẽ được đánh dấu để xử lý. Chưa có thao tác xóa dữ liệu thật trong phase này.",
        "Một số dữ liệu có thể cần được lưu giữ trong thời gian cần thiết cho: đối soát hoa hồng và đơn hàng đang xử lý; chống gian lận và lạm dụng; đáp ứng nghĩa vụ pháp lý hoặc kế toán nếu có. Sau khi hết thời hạn lưu giữ cần thiết, dữ liệu sẽ được xóa hoặc ẩn danh hóa theo chính sách hiện hành.",
      ],
    },
  ],
  foundationNote:
    "Đây là bản nền (foundation) của trang xóa dữ liệu, được biên soạn để chuẩn bị cho việc niêm yết trên cửa hàng ứng dụng trong tương lai. Nội dung này cần được rà soát bởi cố vấn pháp lý trước khi được coi là điều khoản pháp lý chính thức.",
  relatedLinks: [
    { href: "/privacy", label: "Chính sách quyền riêng tư" },
    { href: "/terms", label: "Điều khoản dịch vụ" },
    { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
  ],
};

/** Map from path to policy page, useful for tests + future CMS. */
export const POLICY_PAGES: Readonly<Record<string, PolicyPage>> = {
  "/privacy": PRIVACY_POLICY,
  "/terms": TERMS_POLICY,
  "/cashback-terms": CASHBACK_TERMS_POLICY,
  "/data-deletion": DATA_DELETION_POLICY,
};

/**
 * Internal tokens / identifiers that MUST NEVER appear in any
 * buyer-facing public policy / user-facing copy. The list is
 * deliberately specific so any leak in copy shows up in a unit
 * test rather than in production.
 */
export const FORBIDDEN_BUYER_FACING_TOKENS: ReadonlyArray<string> = [
  "networkSubId",
  "sourceSubId1",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
  "clickId",
  "trackingPath",
  "an_redir",
  "vaflnk",
  "ADDLIVETAG_API_KEY",
  "SERVICE_ROLE",
];

/**
 * Forbidden wording on any buyer-facing copy. Each entry is a
 * case-insensitive substring that MUST NOT appear in any policy
 * page or user-facing copy shipped from this phase.
 *
 * These map directly to the "Forbidden wording" list in the Phase
 * 20I.6 brief.
 */
export const FORBIDDEN_BUYER_FACING_PHRASES: ReadonlyArray<string> = [
  "xóa ngay toàn bộ dữ liệu",
  "cam kết hoàn tiền",
  "cam kết",
  "mua là chắc chắn có hoàn tiền",
  "đảm bảo được duyệt",
  "100% được ch play duyệt",
  "100% được app store duyệt",
  "100% được duyệt",
  "đội ngũ vận hành sẽ xử lý",
  "ghi nhận để xử lý",
];

/**
 * Throw if the page contains any forbidden buyer-facing token or
 * phrase. Used by the unit test suite to lock down copy drift.
 */
export function assertPolicyCopyIsSafe(page: PolicyPage): void {
  const haystack = serialisePage(page).toLowerCase();
  for (const token of FORBIDDEN_BUYER_FACING_TOKENS) {
    if (haystack.includes(token.toLowerCase())) {
      throw new Error(
        `Policy page "${page.slug}" contains forbidden internal token: ${token}`,
      );
    }
  }
  for (const phrase of FORBIDDEN_BUYER_FACING_PHRASES) {
    if (haystack.includes(phrase)) {
      throw new Error(
        `Policy page "${page.slug}" contains forbidden overpromise phrase: ${phrase}`,
      );
    }
  }
}

function serialisePage(page: PolicyPage): string {
  return [
    page.title,
    page.description,
    page.lead,
    page.foundationNote,
    ...page.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ...page.relatedLinks.map((l) => l.label),
  ].join("\n");
}
