import { Injectable } from "@nestjs/common";
import { fetchSafeImage } from "../scraper/safe-image-fetcher";
import { OpportunitiesService } from "./opportunities.service";
import { getOpportunitySourceImageUrl } from "./opportunity-source-image.util";

@Injectable()
export class OpportunitySourceImageService {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  async getForOpportunity(id: string) {
    const opportunity = await this.opportunitiesService.findOneForAdmin(id);
    if (!opportunity) return null;

    const sourceImageUrl = getOpportunitySourceImageUrl(opportunity);
    if (!sourceImageUrl) return null;

    return fetchSafeImage(sourceImageUrl);
  }
}
