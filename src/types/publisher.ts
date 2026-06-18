import type { CampaignId, TrackingLinkId } from "./affiliate";

export type PublisherStatus = "pending" | "approved" | "suspended";

export interface PublisherProfile {
  id: string;
  status: PublisherStatus;
  joinedCampaignIds: CampaignId[];
  trackingLinkIds: TrackingLinkId[];
}
