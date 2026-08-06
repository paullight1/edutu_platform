import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard, Public } from "../auth";
import { ImpactStoriesService } from "./impact-stories.service";
import {
  createImpactStorySchema,
  updateImpactStorySchema,
} from "./impact-stories.dto";

@Controller("impact-stories")
export class ImpactStoriesController {
  constructor(private readonly stories: ImpactStoriesService) {}

  @Get()
  @Public()
  list() {
    return this.stories.findPublished();
  }

  @Get("admin")
  @UseGuards(AdminGuard)
  listAll() {
    return this.stories.findAll();
  }

  // Declared before ":slug" so the literal path is not swallowed by the param.
  @Get(":slug")
  @Public()
  findOne(@Param("slug") slug: string) {
    return this.stories.findBySlug(slug);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: unknown) {
    return this.stories.create(createImpactStorySchema.parse(body));
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.stories.update(id, updateImpactStorySchema.parse(body));
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  remove(@Param("id") id: string) {
    return this.stories.remove(id);
  }
}
