import { Injectable } from "@nestjs/common";
import { fetchSafeImage } from "../scraper/safe-image-fetcher";
import { OpportunitiesService } from "./opportunities.service";
import { getOpportunitySourceImageUrls } from "./opportunity-source-image.util";

@Injectable()
export class OpportunitySourceImageService {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  async getForOpportunity(id: string) {
    const opportunity = await this.opportunitiesService.findOneForAdmin(id);
    if (!opportunity) return null;

    const sourceImageUrls = getOpportunitySourceImageUrls(opportunity);
    if (sourceImageUrls.length === 0) return null;

    let lastError: unknown;
    for (const sourceImageUrl of sourceImageUrls) {
      try {
        return await fetchSafeImage(sourceImageUrl);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No usable source image was found.");
  }
}
