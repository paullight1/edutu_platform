import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth";
import { AdminGuard } from "../auth/admin.guard";
import { toDatabaseUserId } from "../common/user-id";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { pool } from "../db";

const tiers = z.enum(["lite", "pro", "scholar"]);
type Tier = z.infer<typeof tiers>;
const limitSchema = z
  .object({ monthlyLimit: z.number().int().min(3).max(1000).nullable() })
  .strict();
type LimitUpdate = z.infer<typeof limitSchema>;

@UseGuards(AdminGuard)
@Controller("admin/auto-apply")
export class AutoApplyAdminController {
  @Get("plans")
  async plans(@CurrentUser("role") role: string) {
    this.requireQuotaAdmin(role);
    const { rows } = await pool.query(
      'select plan_tier as tier, monthly_limit as "monthlyLimit" from private.auto_apply_plan_limits',
    );
    return rows;
  }

  @Put("plans/:tier")
  async setPlan(
    @CurrentUser("role") role: string,
    @Param("tier", new ZodValidationPipe(tiers)) tier: Tier,
    @Body(new ZodValidationPipe(limitSchema)) body: LimitUpdate,
  ) {
    this.requireQuotaAdmin(role);
    if (body.monthlyLimit === null) {
      await pool.query(
        "delete from private.auto_apply_plan_limits where plan_tier = $1",
        [tier],
      );
    } else {
      await pool.query(
        `insert into private.auto_apply_plan_limits (plan_tier, monthly_limit) values ($1, $2)
         on conflict (plan_tier) do update set monthly_limit = excluded.monthly_limit`,
        [tier, body.monthlyLimit],
      );
    }
    return { monthlyLimit: body.monthlyLimit };
  }

  @Get("users/:id")
  async userLimit(@CurrentUser("role") role: string, @Param("id") id: string) {
    this.requireQuotaAdmin(role);
    const owner = await this.profileOwner(id);
    const { rows } = await pool.query(
      'select monthly_limit as "monthlyLimit" from private.auto_apply_user_limits where user_id = $1',
      [owner],
    );
    return rows[0] ?? { monthlyLimit: null };
  }

  @Put("users/:id")
  async setUserLimit(
    @CurrentUser("role") role: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(limitSchema)) body: LimitUpdate,
  ) {
    this.requireQuotaAdmin(role);
    const owner = await this.profileOwner(id);
    if (body.monthlyLimit === null) {
      await pool.query(
        "delete from private.auto_apply_user_limits where user_id = $1",
        [owner],
      );
    } else {
      await pool.query(
        `insert into private.auto_apply_user_limits (user_id, monthly_limit) values ($1, $2)
         on conflict (user_id) do update set monthly_limit = excluded.monthly_limit`,
        [owner, body.monthlyLimit],
      );
    }
    return { monthlyLimit: body.monthlyLimit };
  }

  private async profileOwner(id: string) {
    if (id.length > 128) throw new NotFoundException("Learner not found");
    const owner = toDatabaseUserId(id);
    const { rowCount } = await pool.query(
      `select 1 from public.profiles where user_id::text in ($1, $2)
       or public.clerk_id_to_uuid(user_id::text) = $2 limit 1`,
      [id, owner],
    );
    if (!rowCount) throw new NotFoundException("Learner not found");
    return owner;
  }

  private requireQuotaAdmin(role: string) {
    if (role !== "admin" && role !== "super_admin") {
      throw new ForbiddenException(
        "Only admins can manage Auto Apply allowances",
      );
    }
  }
}
