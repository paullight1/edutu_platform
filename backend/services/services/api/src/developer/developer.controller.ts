import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreateDeveloperProjectSchema,
  type CreateDeveloperProjectDto,
} from "./developer.dto";
import { DeveloperService } from "./developer.service";

@Controller("developer")
export class DeveloperController {
  constructor(private readonly developerService: DeveloperService) {}

  @Get("dashboard")
  getDashboard(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
  ) {
    return this.developerService.getDashboard(userId, email ?? null);
  }

  @Get("projects")
  listProjects(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
  ) {
    return this.developerService.listProjects(userId, email ?? null);
  }

  @Post("projects")
  createProject(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
    @Body(new ZodValidationPipe(CreateDeveloperProjectSchema))
    body: CreateDeveloperProjectDto,
  ) {
    return this.developerService.createProject(userId, email ?? null, body);
  }

  @Post("projects/:id/rotate")
  rotateProject(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
    @Param("id") projectId: string,
  ) {
    return this.developerService.rotateProject(
      userId,
      email ?? null,
      projectId,
    );
  }

  @Delete("projects/:id")
  revokeProject(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
    @Param("id") projectId: string,
  ) {
    return this.developerService.revokeProject(
      userId,
      email ?? null,
      projectId,
    );
  }
}
