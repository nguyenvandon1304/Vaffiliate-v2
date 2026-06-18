import EmptyState from "@/components/ui/EmptyState";

type Props = {
  offerId: string;
};

export default function TrackingLinkGeneratorNotFound({ offerId }: Props) {
  return (
    <EmptyState
      title="Không thể tạo tracking link"
      description={`Không có dữ liệu offer "${offerId}". Vui lòng quay lại Offer Center.`}
    />
  );
}
