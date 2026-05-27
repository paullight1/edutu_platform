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
import { CurrentUser } from "../auth/current-user.decorator";
import { AdminGuard } from "../auth/admin.guard";
import { NotificationsService } from "./notifications.service";
import {
  BroadcastNotificationSchema,
  NotificationPreferencesSchema,
  RegisterPushTokenSchema,
  type BroadcastNotificationDto,
  type NotificationPreferencesDto,
  type RegisterPushTokenDto,
} from "./dto/notification.dto";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return this.notificationsService.listForUser(userId, limit, cursor);
  }

  @Get("summary")
  summary(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: number,
  ) {
    return this.notificationsService.getSummary(userId, limit);
  }

  @Patch(":id/read")
  markRead(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body: { read?: boolean },
  ) {
    return this.notificationsService.markRead(userId, id, body.read !== false);
  }

  @Patch("read-all")
  markAllRead(@CurrentUser("id") userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.notificationsService.deleteForUser(userId, id);
  }

  @Get("preferences")
  getPreferences(@CurrentUser("id") userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Patch("preferences")
  savePreferences(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(NotificationPreferencesSchema))
    body: NotificationPreferencesDto,
  ) {
    return this.notificationsService.savePreferences(userId, body);
  }

  @Post("push-token")
  registerPushToken(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(RegisterPushTokenSchema))
    body: RegisterPushTokenDto,
  ) {
    return this.notificationsService.registerPushToken(userId, body);
  }

  @Post("admin/broadcast")
  @UseGuards(AdminGuard)
  broadcast(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(BroadcastNotificationSchema))
    body: BroadcastNotificationDto,
  ) {
    return this.notificationsService.broadcast(userId, body);
  }

  @Get("admin/queue")
  @UseGuards(AdminGuard)
  queue(@Query("limit") limit?: number) {
    return this.notificationsService.listQueue(limit);
  }

  @Post("admin/process-due")
  @UseGuards(AdminGuard)
  processDue() {
    return this.notificationsService.processDueQueue();
  }
}
