import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AiService } from "../ai";
import { OpportunitiesService } from "./opportunities.service";

const BUCKET = "opportunities_images";
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

@Injectable()
export class OpportunityImageGenerationService {
  private readonly supabase: SupabaseClient | null;

  constructor(
    private readonly aiService: AiService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  async generateForOpportunity(id: string) {
    if (!this.supabase) {
      throw new ServiceUnavailableException(
        "Opportunity image storage is not configured",
      );
    }

    const opportunity = await this.opportunitiesService.findOneForAdmin(id);
    if (!opportunity) throw new NotFoundException("Opportunity not found");
    const opportunityMetadata =
      opportunity.metadata && typeof opportunity.metadata === "object"
        ? (opportunity.metadata as Record<string, any>)
        : {};

    const title = String(opportunity.title || "Education opportunity").trim();
    const organization = String(opportunity.organization || "").trim();
    const category = String(opportunity.category || "").trim();
    const location = String(opportunity.location || "").trim();
    const description = String(
      opportunity.summary || opportunity.description || "",
    )
      .replace(/\s+/g, " ")
      .slice(0, 1200);
    const prompt = [
      "Create a polished, photorealistic editorial cover image for an education opportunity listing.",
      `Opportunity: ${title}.`,
      organization ? `Organization: ${organization}.` : "",
      category ? `Category: ${category}.` : "",
      location ? `Location: ${location}.` : "",
      description ? `Context: ${description}` : "",
      "Use a hopeful, credible, contemporary visual scene relevant to the opportunity and its audience. Compose as a clean square cover with one clear focal subject, natural lighting, refined blue and teal accents, and generous visual breathing room. No words, lettering, logos, watermarks, badges, or fabricated official branding.",
    ]
      .filter(Boolean)
      .join("\n");

    const generated = await this.aiService.generateImage({
      feature: "opportunities.image",
      prompt,
      metadata: { opportunityId: id },
    });
    const extension = MIME_EXTENSIONS[generated.mimeType];
    if (!extension || generated.data.length === 0) {
      throw new InternalServerErrorException(
        "The image provider returned an empty or unsupported image",
      );
    }

    const path = `ai-generated/${id}/${Date.now()}-${randomUUID()}.${extension}`;
    const bucket = this.supabase.storage.from(BUCKET);
    const { error: uploadError } = await bucket.upload(path, generated.data, {
      contentType: generated.mimeType,
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploadError) {
      throw new ServiceUnavailableException(
        `Could not save generated image: ${uploadError.message}`,
      );
    }

    const { data } = bucket.getPublicUrl(path);
    const updated = await this.opportunitiesService.updateGeneratedImage(
      id,
      data.publicUrl,
      {
        path,
        provider: generated.provider,
        model: generated.model,
        generated_at: new Date().toISOString(),
        source_image_url:
          opportunityMetadata.source_image_url ||
          opportunityMetadata.ai_generated_image?.source_image_url ||
          opportunity.image_url ||
          null,
      },
    );
    return { success: true, imageUrl: data.publicUrl, opportunity: updated };
  }
}
