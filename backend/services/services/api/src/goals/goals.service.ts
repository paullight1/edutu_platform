import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { goals, milestones } from '../db/schema';
import { eq } from 'drizzle-orm';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalsService {
  // Get all goals for a user
  // (userId string matches Supabase auth ID)
  async findAllByUser(userId: string) {
    return await db.select().from(goals).where(eq(goals.userId, userId));
  }

  // Get single goal with milestones
  async findOne(id: string) {
    const goalResult = await db.select().from(goals).where(eq(goals.id, id));
    if (!goalResult.length) return null;

    const milestonesResult = await db
      .select()
      .from(milestones)
      .where(eq(milestones.goalId, id));

    return { ...goalResult[0], milestones: milestonesResult };
  }

  // Create
  async create(userId: string, createGoalDto: CreateGoalDto) {
    const [newGoal] = await db
      .insert(goals)
      .values({
        userId, // We must link it to the user manually for now
        title: createGoalDto.title,
        description: createGoalDto.description,
        category: createGoalDto.category,
        targetDate: createGoalDto.targetDate
          ? new Date(createGoalDto.targetDate)
          : null,
      })
      .returning();
    return newGoal;
  }

  // Update
  async update(id: string, updateGoalDto: UpdateGoalDto) {
    const [updatedGoal] = await db
      .update(goals)
      .set({
        ...updateGoalDto,
        targetDate: updateGoalDto.targetDate
          ? new Date(updateGoalDto.targetDate)
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(goals.id, id))
      .returning();
    return updatedGoal;
  }

  // Delete
  async remove(id: string) {
    // Cascade delete is configured in DB, but good practice to be explicit or handle cleanup
    // Drizzle schema reference "onDelete: cascade" handles milestones, but let's just delete the goal
    await db.delete(goals).where(eq(goals.id, id));
    return { success: true };
  }
}
