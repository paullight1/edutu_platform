import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AdminGuard } from "../auth/admin.guard";
import { Public } from "../auth/public.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  BroadcastNotificationSchema,
  NotificationPreferencesSchema,
  RegisterPushTokenSchema,
  type BroadcastNotificationDto,
  type NotificationPreferencesDto,
  type RegisterPushTokenDto,
} from "./dto/notification.dto";
import { NotificationQueueOperationsService } from "./notification-queue-operations.service";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly queueOperations: NotificationQueueOperationsService,
  ) {}

  @Get()
  list(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return this.notificationsService.listForUser(userId, limit, cursor);
  }

  @Get("summary")
  summary(@CurrentUser("id") userId: string, @Query("limit") limit?: number) {
    return this.notificationsService.getSummary(userId, limit);
  }

  /**
   * Records that the user tapped the notification itself (distinct from
   * `read_at`, which only means it was seen in the inbox list).
   *
   * PUBLIC BY NECESSITY: the web service worker that reports this has no Clerk
   * session — a `notificationclick` usually wakes a cold worker with no page
   * around to supply a token — so it sends `credentials: "omit"`. The design
   * makes that safe rather than merely tolerable:
   *   - the id is a uuid4, so it cannot be guessed or enumerated;
   *   - it only ever sets `opened_at`, and only when currently null, so a
   *     replay is a no-op and nothing user-visible can be mutated;
   *   - it ALWAYS returns 204 whether or not the id exists, so it cannot be
   *     used as an oracle to test which notification ids are real.
   * The worst an attacker who already knows an id can do is falsify one row of
   * engagement telemetry. That is an acceptable trade for a metrics field; it
   * would not be for anything that changes what a user sees.
   */
  @Public()
  @Post(":id/opened")
  @HttpCode(204)
  async markOpened(@Param("id") id: string): Promise<void> {
    await this.notificationsService.markOpened(id);
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

  @Delete("push-token/:token")
  unregisterPushToken(
    @CurrentUser("id") userId: string,
    @Param("token") token: string,
  ) {
    return this.notificationsService.unregisterPushToken(userId, token);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.notificationsService.deleteForUser(userId, id);
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

  @Get("admin/queue/health")
  @UseGuards(AdminGuard)
  queueHealth() {
    return this.queueOperations.getHealth();
  }

  @Post("admin/process-due")
  @UseGuards(AdminGuard)
  processDue() {
    return this.notificationsService.processDueQueue();
  }

  @Delete("admin/queue/:id")
  @UseGuards(AdminGuard)
  cancelQueued(@Param("id") id: string) {
    return this.notificationsService.cancelQueuedBroadcast(id);
  }
}
