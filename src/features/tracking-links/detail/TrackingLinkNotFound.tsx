import EmptyState from "@/components/ui/EmptyState";

type Props = {
  trackingLinkId: string;
};

export default function TrackingLinkNotFound({ trackingLinkId }: Props) {
  return (
    <EmptyState
      title="Không tìm thấy link hoàn tiền"
      description={`Không có dữ liệu cho link hoàn tiền "${trackingLinkId}". Vui lòng quay lại danh sách link hoàn tiền.`}
    />
  );
}
