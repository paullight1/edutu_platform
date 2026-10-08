import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";

@Injectable()
export class OpportunityImageGenerationService {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly shareCardService: OpportunityShareCardService,
  ) {}

  async generateForOpportunity(id: string) {
    const opportunity = await this.opportunitiesService.findOneForAdmin(id);
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    // Render the flyer from verified opportunity fields. Image models produce
    // decorative photos and frequently render opportunity text incorrectly;
    // flyer copy must remain readable and faithful to the listing.
    const flyer = await this.shareCardService.ensureShareCardForOpportunity(
      opportunity,
      { force: true },
    );
    if (!flyer?.url) {
      throw new ServiceUnavailableException(
        "Could not generate the opportunity flyer",
      );
    }

    const metadata =
      opportunity.metadata && typeof opportunity.metadata === "object"
        ? (opportunity.metadata as Record<string, any>)
        : {};
    const updated = await this.opportunitiesService.updateGeneratedImage(
      id,
      flyer.url,
      {
        path: flyer.path,
        provider: "edutu-flyer-renderer",
        model: "opportunity-share-card",
        format: flyer.format,
        generated_at: new Date().toISOString(),
        source_image_url:
          metadata.source_image_url ||
          opportunity.image_url ||
          null,
      },
    );
    return {
      success: true,
      imageUrl: flyer.url,
      flyer,
      opportunity: updated,
    };
  }
}
