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
import { CreateGoalDto } from "./dto/create-goal.dto";
import { UpdateGoalDto } from "./dto/update-goal.dto";
import { CurrentUser } from "../auth";

@Controller("goals")
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body() createGoalDto: CreateGoalDto,
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
    @Body() updateGoalDto: UpdateGoalDto,
  ) {
    return this.goalsService.update(userId, id, updateGoalDto);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.goalsService.remove(userId, id);
  }
}
