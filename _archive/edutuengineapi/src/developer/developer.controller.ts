import {
  BadRequestException,
  Body,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Controller,
} from "@nestjs/common";
import { z } from "zod";

import { ApiKeyStore } from "../auth/api-key.store.js";
import { Public } from "../auth/public.decorator.js";
import { extractDeveloperTokenFromHeaders } from "../auth/developer-auth.util.js";

const DeveloperSignupSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please provide a valid email address"),
});

const ProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name must be at least 2 characters"),
  environment: z.enum(["test", "live"]).optional(),
  scopes: z.array(z.string().trim().min(1)).optional(),
  monthlyQuota: z.number().int().min(0).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  initialCredits: z.number().int().min(0).optional(),
});

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: "Invalid request payload",
      issues: result.error.issues,
    });
  }
  return result.data;
}

function getDeveloperToken(request: { headers: Record<string, string | string[] | undefined> }) {
  const token = extractDeveloperTokenFromHeaders(request.headers);
  if (!token) {
    throw new HttpException(
      {
        message: "Missing developer token",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
  return token;
}

@Controller("v1/developer")
export class DeveloperController {
  constructor(private readonly apiKeyStore: ApiKeyStore) {}

  @Public()
  @Post("signup")
  async signup(@Body() body: unknown) {
    const payload = parseBody(DeveloperSignupSchema, body);
    return this.apiKeyStore.signupAccount(payload);
  }

  @Public()
  @Post("login")
  async login(@Body() body: unknown) {
    const payload = parseBody(DeveloperSignupSchema, body);
    return this.apiKeyStore.login(payload);
  }

  @Get("me")
  async getDashboard(@Req() request: RequestLike) {
    const developerToken = getDeveloperToken(request);
    return this.apiKeyStore.getDashboard(developerToken);
  }

  @Get("projects")
  async listProjects(@Req() request: RequestLike) {
    const developerToken = getDeveloperToken(request);
    return this.apiKeyStore.listProjects(developerToken);
  }

  @Post("projects")
  async createProject(
    @Req() request: RequestLike,
    @Body() body: unknown,
  ) {
    const developerToken = getDeveloperToken(request);
    const input = parseBody(ProjectSchema, body);
    const created = await this.apiKeyStore.createProject(developerToken, input);
    return {
      ...created,
      note: "Store this raw API key securely. It will not be shown again.",
    };
  }

  @Post("projects/:id/rotate")
  async rotateProject(
    @Req() request: RequestLike,
    @Param("id") projectId: string,
  ) {
    const developerToken = getDeveloperToken(request);
    const rotated = await this.apiKeyStore.rotateProject(
      developerToken,
      projectId,
    );

    return {
      ...rotated,
      note: "Store this raw API key securely. It will not be shown again.",
    };
  }

  @Delete("projects/:id")
  async revokeProject(
    @Req() request: RequestLike,
    @Param("id") projectId: string,
  ) {
    const developerToken = getDeveloperToken(request);
    return this.apiKeyStore.revokeProject(developerToken, projectId);
  }

  @Get("projects/:projectId/requests")
  async listProjectRequests(
    @Req() request: RequestLike,
    @Param("projectId") projectId: string,
  ) {
    const developerToken = getDeveloperToken(request);
    const account = await this.apiKeyStore.getAccountByDeveloperToken(developerToken);
    if (!account) {
      throw new HttpException("Invalid developer token", HttpStatus.UNAUTHORIZED);
    }

    const projects = await this.apiKeyStore.listProjects(developerToken);
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) {
      throw new HttpException("Project not found", HttpStatus.NOT_FOUND);
    }

    if (project.ownerAccountId !== account.id) {
      throw new HttpException("Project access denied", HttpStatus.FORBIDDEN);
    }

    return {
      projectId,
      data: await this.apiKeyStore.getUsageEvents(projectId, 50),
    };
  }
}
