import EmptyState from "@/components/ui/EmptyState";

type Props = {
  offerId: string;
};

export default function OfferNotFound({ offerId }: Props) {
  return (
    <EmptyState
      title="Không tìm thấy chương trình hoàn tiền"
      description={`Không có dữ liệu cho chương trình "${offerId}". Vui lòng quay lại danh sách chương trình hoàn tiền để chọn chương trình khác.`}
    />
  );
}
