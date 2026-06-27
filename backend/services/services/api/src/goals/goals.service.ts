import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { db } from "../db";
import { goals, milestones } from "../db/schema";
import { and, desc, eq } from "drizzle-orm";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import type { BroadcastNotificationDto } from "../notifications/dto/notification.dto";
import type { CreateGoalDto } from "./dto/create-goal.dto";
import type { UpdateGoalDto } from "./dto/update-goal.dto";

type GoalRow = typeof goals.$inferSelect;
type GoalInsert = typeof goals.$inferInsert;
type GoalMutation = Partial<GoalInsert>;

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  // Get all goals for a user
  // (userId string matches Supabase auth ID)
  async findAllByUser(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const rows = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, dbUserId))
      .orderBy(desc(goals.createdAt));

    return rows.map((goal) => this.serializeGoal(goal));
  }

  // Get single goal with milestones
  async findOne(userId: string, id: string) {
    const dbUserId = toDatabaseUserId(userId);
    const goalResult = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, dbUserId)));
    if (!goalResult.length) throw new NotFoundException("Goal not found");

    const milestonesResult = await db
      .select()
      .from(milestones)
      .where(eq(milestones.goalId, id));

    return {
      ...this.serializeGoal(goalResult[0]),
      milestones: milestonesResult,
    };
  }

  // Create
  async create(userId: string, createGoalDto: CreateGoalDto) {
    const dbUserId = toDatabaseUserId(userId);
    const targetDate = this.resolveTargetDate(createGoalDto);
    const status =
      createGoalDto.status ??
      ((createGoalDto.progress ?? 0) >= 100 ? "completed" : "active");

    const [newGoal] = await db
      .insert(goals)
      .values({
        userId: dbUserId,
        title: createGoalDto.title,
        description: createGoalDto.description || null,
        category: createGoalDto.category || null,
        progress: this.normalizeProgress(createGoalDto.progress),
        status,
        targetDate,
        deadline: this.toLegacyDeadline(targetDate),
        priority: createGoalDto.priority || null,
        source: createGoalDto.source || "custom",
        templateId:
          createGoalDto.templateId || createGoalDto.template_id || null,
        completedAt: status === "completed" ? new Date() : null,
      })
      .returning();
    const serialized = this.serializeGoal(newGoal);
    await this.replaceGoalReminderQueue(dbUserId, serialized);
    return serialized;
  }

  // Update
  async update(userId: string, id: string, updateGoalDto: UpdateGoalDto) {
    const dbUserId = toDatabaseUserId(userId);
    const now = new Date();
    const values = this.buildUpdateValues(updateGoalDto, now);

    const [updatedGoal] = await db
      .update(goals)
      .set(values)
      .where(and(eq(goals.id, id), eq(goals.userId, dbUserId)))
      .returning();

    if (!updatedGoal) throw new NotFoundException("Goal not found");
    const serialized = this.serializeGoal(updatedGoal);
    await this.replaceGoalReminderQueue(dbUserId, serialized);
    return serialized;
  }

  // Delete
  async remove(userId: string, id: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [deleted] = await db
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, dbUserId)))
      .returning({ id: goals.id });

    if (!deleted) throw new NotFoundException("Goal not found");
    await this.cancelGoalReminders(dbUserId, id);
    return { success: true };
  }

  private buildUpdateValues(dto: UpdateGoalDto, now: Date): GoalMutation {
    const values: GoalMutation = { updatedAt: now };

    if (dto.title !== undefined) values.title = dto.title;
    if (dto.description !== undefined)
      values.description = dto.description || null;
    if (dto.category !== undefined) values.category = dto.category || null;
    if (dto.progress !== undefined) {
      values.progress = this.normalizeProgress(dto.progress);
      if (values.progress >= 100 && dto.status === undefined) {
        values.status = "completed";
        values.completedAt = now;
      }
    }
    if (dto.status !== undefined) {
      values.status = dto.status;
      values.completedAt = dto.status === "completed" ? now : null;
    }
    if (dto.priority !== undefined) values.priority = dto.priority || null;
    if (dto.source !== undefined) values.source = dto.source || "custom";
    if (dto.templateId !== undefined || dto.template_id !== undefined) {
      values.templateId = dto.templateId || dto.template_id || null;
    }

    if ("targetDate" in dto || "deadline" in dto) {
      const targetDate = this.resolveTargetDate(dto);
      values.targetDate = targetDate;
      values.deadline = this.toLegacyDeadline(targetDate);
    }

    return values;
  }

  private resolveTargetDate(
    dto: Pick<CreateGoalDto, "targetDate" | "deadline">,
  ) {
    const rawValue = dto.targetDate ?? dto.deadline ?? null;
    if (!rawValue) return null;
    return new Date(rawValue);
  }

  private normalizeProgress(progress: number | undefined) {
    return Math.min(Math.max(Math.round(progress ?? 0), 0), 100);
  }

  private toLegacyDeadline(value: Date | null) {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  private serializeGoal(goal: GoalRow) {
    const deadline = goal.targetDate ?? goal.deadline ?? null;

    return {
      ...goal,
      user_id: goal.userId,
      target_date: goal.targetDate,
      deadline,
      created_at: goal.createdAt,
      updated_at: goal.updatedAt,
      completed_at: goal.completedAt,
      template_id: goal.templateId,
    };
  }

  private async replaceGoalReminderQueue(
    userId: string,
    goal: ReturnType<GoalsService["serializeGoal"]>,
  ) {
    if (!this.notificationsService) return;

    const dedupePrefix = `goal:${goal.id}`;
    const isActive = goal.status !== "completed" && goal.status !== "archived";
    const targetDate = goal.targetDate ?? goal.target_date ?? null;

    if (!isActive || !targetDate) {
      await this.cancelGoalReminders(userId, goal.id);
      return;
    }

    const reminders = this.buildGoalReminders(goal, new Date(targetDate));

    try {
      await this.notificationsService.replaceScheduledUserNotifications(
        userId,
        dedupePrefix,
        reminders,
      );
    } catch (error) {
      this.logger.warn(
        `Could not schedule goal reminders for ${goal.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async cancelGoalReminders(userId: string, goalId: string) {
    if (!this.notificationsService) return;

    try {
      await this.notificationsService.replaceScheduledUserNotifications(
        userId,
        `goal:${goalId}`,
        [],
      );
    } catch (error) {
      this.logger.warn(
        `Could not cancel goal reminders for ${goalId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildGoalReminders(
    goal: ReturnType<GoalsService["serializeGoal"]>,
    targetDate: Date,
  ): BroadcastNotificationDto[] {
    if (Number.isNaN(targetDate.getTime())) return [];

    return [7, 3, 1, 0].map((daysBefore) => {
      const scheduledFor = new Date(targetDate);
      scheduledFor.setUTCDate(scheduledFor.getUTCDate() - daysBefore);
      scheduledFor.setUTCHours(9, 0, 0, 0);

      const title =
        daysBefore === 0
          ? "Goal deadline today"
          : `${daysBefore} day${daysBefore === 1 ? "" : "s"} until goal deadline`;

      return {
        title,
        body: goal.title,
        kind: "goal-reminder",
        severity: daysBefore <= 1 ? "warning" : "info",
        scheduledFor: scheduledFor.toISOString(),
        dedupeKey: `goal:${goal.id}:${daysBefore}`,
        metadata: {
          goalId: goal.id,
          goalTitle: goal.title,
          targetDate: targetDate.toISOString(),
          daysBefore,
        },
      };
    });
  }
}
