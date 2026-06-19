import type {
  CampaignId,
  PublisherId,
  TrackingLinkId,
} from "./ids";

export type PublisherStatus = "pending" | "approved" | "suspended";

export interface PublisherProfile {
  id: PublisherId;
  status: PublisherStatus;
  joinedCampaignIds: CampaignId[];
  trackingLinkIds: TrackingLinkId[];
}
