import Card from "@/components/ui/Card";

export default function TrustNotice() {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-[color:var(--text)]">
        Lưu ý về cashback
      </p>
      <p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
        Cashback chỉ được xác nhận sau khi đối tác đối soát giao dịch. Đơn bị hủy, hoàn trả hoặc không đáp ứng điều kiện có thể không được nhận cashback.
      </p>
    </Card>
  );
}
