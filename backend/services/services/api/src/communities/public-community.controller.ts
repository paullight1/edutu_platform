import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { PublicCommunityService } from "./public-community.service";

@Public()
@Controller("public/communities")
export class PublicCommunityController {
  constructor(private readonly communities: PublicCommunityService) {}

  @Get("groups")
  list(@Query("limit") limit?: string) {
    return this.communities.list(this.parseLimit(limit));
  }

  @Get("groups/:slug")
  get(@Param("slug") slug: string) {
    return this.communities.getBySlug(slug);
  }

  private parseLimit(value?: string): number {
    if (!value) return 20;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException("limit must be a positive number.");
    }
    return Math.min(Math.floor(parsed), 50);
  }
}
