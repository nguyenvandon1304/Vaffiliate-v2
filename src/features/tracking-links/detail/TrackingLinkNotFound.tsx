import EmptyState from "@/components/ui/EmptyState";

type Props = {
  trackingLinkId: string;
};

export default function TrackingLinkNotFound({ trackingLinkId }: Props) {
  return (
    <EmptyState
      title="Không tìm thấy tracking link"
      description={`Không có dữ liệu cho tracking link "${trackingLinkId}". Vui lòng quay lại danh sách tracking link.`}
    />
  );
}
