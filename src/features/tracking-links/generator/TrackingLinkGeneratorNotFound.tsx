import EmptyState from "@/components/ui/EmptyState";

type Props = {
  offerId: string;
};

export default function TrackingLinkGeneratorNotFound({ offerId }: Props) {
  return (
    <EmptyState
      title="Không thể tạo link hoàn tiền"
      description={`Không có dữ liệu cho chương trình "${offerId}". Vui lòng quay lại danh sách chương trình hoàn tiền.`}
    />
  );
}
