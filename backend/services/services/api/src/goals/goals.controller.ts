import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";
import { GoalsService } from "./goals.service";
import { CreateGoalSchema, type CreateGoalDto } from "./dto/create-goal.dto";
import { UpdateGoalSchema, type UpdateGoalDto } from "./dto/update-goal.dto";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("goals")
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(CreateGoalSchema)) createGoalDto: CreateGoalDto,
  ) {
    return this.goalsService.create(userId, createGoalDto);
  }

  @Get()
  findAll(@CurrentUser("id") userId: string) {
    return this.goalsService.findAllByUser(userId);
  }

  @Get(":id")
  findOne(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.goalsService.findOne(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateGoalSchema)) updateGoalDto: UpdateGoalDto,
  ) {
    return this.goalsService.update(userId, id, updateGoalDto);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.goalsService.remove(userId, id);
  }
}
