import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { EngineService } from "./engine.service.js";
import { assertSafeHttpUrl } from "./url-safety.js";

const ExtractUrlSchema = z.object({
  url: z.string().url(),
  sourceUrl: z.string().url().optional(),
});

const ScrapeRunSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().int().min(1).max(5).optional().default(1),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

@Controller("v1")
export class EngineController {
  constructor(private readonly engineService: EngineService) {}

  @Post("extract/url")
  async extractUrl(@Body() body: unknown) {
    const input = this.parseBody(ExtractUrlSchema, body, "extract/url");
    const detailUrl = assertSafeHttpUrl(input.url).toString();
    const sourceUrl = assertSafeHttpUrl(input.sourceUrl || input.url).toString();
    return {
      success: true,
      opportunity: await this.engineService.extractOpportunityUrl(detailUrl, sourceUrl),
    };
  }

  @Post("scrape/run")
  async runScrape(@Body() body: unknown) {
    const input = this.parseBody(ScrapeRunSchema, body, "scrape/run");
    const sourceUrl = assertSafeHttpUrl(input.url).toString();
    return this.engineService.runScrape(sourceUrl, {
      maxPages: input.maxPages,
      limit: input.limit,
    });
  }

  private parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown, route: string): z.infer<T> {
    const result = schema.safeParse(body);
    if (result.success) return result.data;

    throw new BadRequestException({
      message: `Invalid request body for ${route}`,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
  }
}
