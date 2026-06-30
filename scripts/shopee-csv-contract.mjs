export const SHOPEE_CSV_PARSER_VERSION =
"shopee-affiliate-commission-v1";

export const SHOPEE_CSV_HEADERS = Object.freeze([
"ID đơn hàng",
"Trạng thái đặt hàng",
"Checkout id",
"Thời Gian Đặt Hàng",
"Thời gian hoàn thành",
"Thời gian Click",
"Tên Shop",
"Shop id",
"Loại Shop",
"Item id",
"Tên Item",
"ID Model",
"Loại sản phẩm",
"Promotion id",
"L1 Danh mục toàn cầu",
"L2 Danh mục toàn cầu",
"L3 Danh mục toàn cầu",
"Giá(₫)",
"Số lượng",
"Loại Hoa hồng",
"Đối tác chiến dịchr",
"Giá trị đơn hàng (₫)",
"Số tiền hoàn trả (₫)",
"Tỷ lệ sản phẩm hoa hồng Shope",
"Hoa hồng Shopee trên sản phẩm(₫)",
"Tỷ lệ sản phẩm hoa hồng người bán",
"Hoa hồng Xtra trên sản phẩm(₫)",
"Tổng hoa hồng sản phẩm(₫)",
"Hoa hồng đơn hàng từ Shopee(₫)",
"Hoa hồng đơn hàng từ Người bán(₫)",
"Tổng hoa hồng đơn hàng(₫)",
"Tên MNC đã liên kết",
"Mã hợp đồng MCN",
"Mức phí quản lý MCN",
"Phí quản lý MCN(₫)",
"Mức hoa hồng tiếp thị liên kết theo thỏa thuận",
"Hoa hồng ròng tiếp thị liên kết(₫)",
"Trạng thái sản phẩm liên kết",
"Ghi chú sản phẩm",
"Loại thuộc tính",
"Trạng thái người mua",
"Sub_id1",
"Sub_id2",
"Sub_id3",
"Sub_id4",
"Sub_id5",
"Kênh",
]);

export const SHOPEE_CSV_FIELDS = Object.freeze({
externalOrderId: "ID đơn hàng",
orderStatus: "Trạng thái đặt hàng",
checkoutId: "Checkout id",
orderedAt: "Thời Gian Đặt Hàng",
completedAt: "Thời gian hoàn thành",
clickedAt: "Thời gian Click",
shopId: "Shop id",
itemId: "Item id",
modelId: "ID Model",
promotionId: "Promotion id",
quantity: "Số lượng",
orderValue: "Giá trị đơn hàng (₫)",
refundedAmount: "Số tiền hoàn trả (₫)",
totalProductCommission: "Tổng hoa hồng sản phẩm(₫)",
totalOrderCommission: "Tổng hoa hồng đơn hàng(₫)",
netAffiliateCommission:
"Hoa hồng ròng tiếp thị liên kết(₫)",
linkedProductStatus: "Trạng thái sản phẩm liên kết",
sourceSubId1: "Sub_id1",
sourceSubId2: "Sub_id2",
sourceSubId3: "Sub_id3",
sourceSubId4: "Sub_id4",
sourceSubId5: "Sub_id5",
channel: "Kênh",
});

export function assertShopeeCsvHeaders(headers) {
if (!Array.isArray(headers)) {
throw new TypeError("CSV headers must be an array.");
}

if (headers.length !== SHOPEE_CSV_HEADERS.length) {
throw new Error(
`Expected ${SHOPEE_CSV_HEADERS.length} CSV headers, ` +
`received ${headers.length}.`,
);
}

for (
let index = 0;
index < SHOPEE_CSV_HEADERS.length;
index += 1
) {
const expected = SHOPEE_CSV_HEADERS[index];
const actual = headers[index];

if (actual !== expected) {
  throw new Error(
    `Unexpected CSV header at position ${index + 1}: ` +
      `expected "${expected}", received "${actual}".`,
  );
}

}
}
