import { BadRequestException, Body, Get, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";

import { ApiKeyStore } from "../auth/api-key.store.js";
import { Public } from "../auth/public.decorator.js";
import { extractDeveloperTokenFromHeaders } from "../auth/developer-auth.util.js";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

const CheckoutSchema = z.object({
  projectId: z.string().trim().min(1, "projectId is required"),
  planId: z.string().trim().min(1, "planId is required"),
});

const MockSuccessSchema = z.object({
  projectId: z.string().trim().min(1, "projectId is required"),
  reference: z.string().trim().min(1, "reference is required"),
});

const ProjectIdSchema = z.string().trim().min(1, "projectId is required");

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: "Invalid request payload",
      issues: result.error.issues,
    });
  }
  return result.data;
}

function getDeveloperToken(
  request: RequestLike,
): string {
  const token = extractDeveloperTokenFromHeaders(request.headers);
  if (!token) {
    throw new BadRequestException({
      message: "Missing developer token",
    });
  }
  return token;
}

@Controller("v1/billing")
export class BillingController {
  constructor(private readonly apiKeyStore: ApiKeyStore) {}

  @Public()
  @Get("plans")
  async getPlans() {
    return {
      plans: this.apiKeyStore.listPlans(),
    };
  }

  @Post("checkout")
  async startCheckout(@Req() request: RequestLike, @Body() body: unknown) {
    const token = getDeveloperToken(request);
    const input = parseBody(CheckoutSchema, body);
    return this.apiKeyStore.createCheckoutSession(
      token,
      input.projectId,
      input.planId,
    );
  }

  @Get("projects/:projectId/summary")
  async getProjectSummary(
    @Req() request: RequestLike,
    @Param("projectId") projectId: string,
  ) {
    const token = getDeveloperToken(request);
    const parsedProjectId = ProjectIdSchema.safeParse(projectId);
    if (!parsedProjectId.success) {
      throw new BadRequestException({
        message: "Invalid projectId",
        issues: parsedProjectId.error.issues,
      });
    }

    return this.apiKeyStore.getUsageSummary(token, parsedProjectId.data);
  }

  @Get("projects/:projectId/invoices")
  async listProjectInvoices(
    @Req() request: RequestLike,
    @Param("projectId") projectId: string,
  ) {
    const token = getDeveloperToken(request);
    const parsedProjectId = ProjectIdSchema.safeParse(projectId);
    if (!parsedProjectId.success) {
      throw new BadRequestException({
        message: "Invalid projectId",
        issues: parsedProjectId.error.issues,
      });
    }

    await this.apiKeyStore.getUsageSummary(token, parsedProjectId.data);
    return {
      projectId: parsedProjectId.data,
      invoices: await this.apiKeyStore.getProjectInvoiceHistory(parsedProjectId.data),
    };
  }

  @Post("mock-success")
  async mockSuccess(@Req() request: RequestLike, @Body() body: unknown) {
    const token = getDeveloperToken(request);
    const input = parseBody(MockSuccessSchema, body);
    const project = await this.apiKeyStore.markInvoicePaid(
      input.projectId,
      input.reference,
    );
    if (!project) {
      return {
        status: "not_found",
        message: "No matching pending invoice found for this project.",
      };
    }

    return {
      status: "paid",
      invoice: project,
    };
  }

  @Get("projects/:projectId/balance")
  async getProjectBalance(
    @Req() request: RequestLike,
    @Param("projectId") projectId: string,
  ) {
    const token = getDeveloperToken(request);
    const parsedProjectId = ProjectIdSchema.safeParse(projectId);
    if (!parsedProjectId.success) {
      throw new BadRequestException({
        message: "Invalid projectId",
        issues: parsedProjectId.error.issues,
      });
    }

    return this.apiKeyStore.getUsageSummary(token, parsedProjectId.data);
  }
}
