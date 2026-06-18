import EmptyState from "@/components/ui/EmptyState";

type Props = {
  offerId: string;
};

export default function OfferNotFound({ offerId }: Props) {
  return (
    <EmptyState
      title="Không tìm thấy offer"
      description={`Không có dữ liệu cho offer "${offerId}". Vui lòng quay lại Offer Center để chọn offer khác.`}
    />
  );
}
