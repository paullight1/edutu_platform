import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, Public, AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreateEventSchema,
  JoinEventSchema,
  UpdateEventSchema,
  type CreateEventDto,
  type JoinEventDto,
  type UpdateEventDto,
} from "./event.dto";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Public()
  findAll(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.eventsService.findAll({
      limit,
      offset,
      status: status || "published",
      search,
    });
  }

  @Get("admin/list")
  @UseGuards(AdminGuard)
  findAdminList(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.eventsService.findAdminList({ limit, offset, status, search });
  }

  @Post("admin")
  @UseGuards(AdminGuard)
  create(
    @Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventDto,
    @CurrentUser("id") userId?: string,
  ) {
    return this.eventsService.create(body, userId);
  }

  @Patch("admin/:id")
  @UseGuards(AdminGuard)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) body: UpdateEventDto,
  ) {
    return this.eventsService.update(id, body);
  }

  @Delete("admin/:id")
  @UseGuards(AdminGuard)
  archive(@Param("id") id: string) {
    return this.eventsService.archive(id);
  }

  @Get(":slugOrId")
  @Public()
  findOne(@Param("slugOrId") slugOrId: string) {
    return this.eventsService.findOnePublic(slugOrId);
  }

  @Post(":slugOrId/join")
  @Public()
  join(
    @Param("slugOrId") slugOrId: string,
    @Body(new ZodValidationPipe(JoinEventSchema)) body: JoinEventDto,
  ) {
    return this.eventsService.join(slugOrId, body);
  }
}
