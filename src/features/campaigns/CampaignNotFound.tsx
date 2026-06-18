import EmptyState from "@/components/ui/EmptyState";

type Props = {
  campaignId: string;
};

export default function CampaignNotFound({ campaignId }: Props) {
  return (
    <EmptyState
      title="Không tìm thấy chiến dịch"
      description={`Không có dữ liệu cho chiến dịch "${campaignId}". Vui lòng quay lại danh sách offer hoặc tracking link.`}
    />
  );
}
