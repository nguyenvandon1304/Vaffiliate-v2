import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CampaignCommissionCard from "@/features/campaigns/CampaignCommissionCard";
import CampaignHeader from "@/features/campaigns/CampaignHeader";
import CampaignNotFound from "@/features/campaigns/CampaignNotFound";
import CampaignStatsGrid from "@/features/campaigns/CampaignStatsGrid";
import CampaignTrackingCard from "@/features/campaigns/CampaignTrackingCard";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { loadCampaignDetailAsync } from "@/hooks/loadCampaignDetailAsync";

type RouteParams = {
  campaignId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

export async function generateStaticParams(): Promise<RouteParams[]> {
  const { campaigns } = await loadAffiliateAsync();
  return campaigns.map((campaign) => ({ campaignId: campaign.id }));
}

async function loadCampaignOrNull(campaignId: string) {
  try {
    return await loadCampaignDetailAsync(campaignId);
  } catch {
    return null;
  }
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { campaignId } = await params;
  const result = await loadCampaignOrNull(campaignId);

  if (!result) {
    return (
      <AppShell desktopContent={<CampaignNotFound campaignId={campaignId} />}>
        <AppSection className="pb-8">
          <CampaignNotFound campaignId={campaignId} />
        </AppSection>
      </AppShell>
    );
  }

  const { campaignDetail, statistics } = result;

  const desktopContent = (
    <div className="space-y-6">
      <CampaignHeader campaignDetail={campaignDetail} />
      <CampaignStatsGrid statistics={statistics} />
      <section className="grid gap-4 xl:grid-cols-2">
        <CampaignCommissionCard commission={campaignDetail.commission} />
        <CampaignTrackingCard trackingSettings={campaignDetail.trackingSettings} />
      </section>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              {campaignDetail.advertiser.platform} · {campaignDetail.advertiser.name}
            </p>
          }
          title={campaignDetail.campaign.name}
          description="Chi tiết chiến dịch, cơ chế hoa hồng và cấu hình tracking."
        />
      </AppSection>
      <AppSection className="mb-4">
        <CampaignHeader campaignDetail={campaignDetail} />
      </AppSection>
      <AppSection className="mb-4">
        <CampaignStatsGrid statistics={statistics} />
      </AppSection>
      <AppSection className="mb-4">
        <CampaignCommissionCard commission={campaignDetail.commission} />
      </AppSection>
      <AppSection className="pb-8">
        <CampaignTrackingCard trackingSettings={campaignDetail.trackingSettings} />
      </AppSection>
    </AppShell>
  );
}
