import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ApiConsumerContext } from "./current-api-consumer.decorator.js";

type ProjectEnvironment = "test" | "live" | "unknown";

interface StoredAccount {
  id: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredProject {
  id: string;
  ownerAccountId: string;
  name: string;
  environment: ProjectEnvironment;
  status: "active" | "revoked" | "expired";
  plan: string;
  keyPrefix: string;
  keyHash: string;
  allowedScopes: string[];
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
  monthlyPeriodStart: string;
  monthlyRequestCount: number;
  creditsBalance: number | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredUsageEvent {
  id: string;
  projectId: string;
  requestId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

interface StoredInvoice {
  id: string;
  projectId: string;
  planId: string;
  reference: string;
  amountCents: number;
  currency: "USD";
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt: string | null;
}

export interface PublicUsageEvent {
  id: string;
  requestId: string;
  method: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

export interface DashboardProject {
  id: string;
  name: string;
  environment: ProjectEnvironment;
  status: "active" | "revoked" | "expired";
  plan: string;
  keyPrefix: string;
  scopes: string[];
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
  creditsBalance: number | null;
  usage: {
    monthlyLimit: number | null;
    monthlyRequestCount: number;
    monthlyRemaining: number | null;
    monthlyResetAt: string;
    lastUsedAt: string | null;
  };
  requestCount: number;
  remainingQuota: number | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface DeveloperDashboard {
  account: {
    id: string;
    email: string;
  };
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalRequestsThisMonth: number;
    totalMonthlyQuota: number | null;
    totalRemainingQuota: number | null;
    unlimitedProjects: number;
    latestActivityAt: string | null;
  };
  onboarding: Array<{
    title: string;
    description: string;
  }>;
  projects: DashboardProject[];
  recentRequests: Array<PublicUsageEvent & { consumerId: string; consumerName: string; keyPrefix: string | null; environment: ProjectEnvironment | null }>;
}

export interface BillingPlan {
  id: string;
  name: string;
  monthlyQuota: number;
  rateLimitPerMinute: number;
  initialCredits: number;
  amountCents: number;
  currency: "USD";
  interval: "monthly" | "yearly";
}

interface StorePayload {
  version: 1;
  accounts: StoredAccount[];
  projects: StoredProject[];
  events: StoredUsageEvent[];
  invoices: StoredInvoice[];
}

export interface UsageBudget {
  allowed: boolean;
  monthlyLimit: number | null;
  monthlyRemaining: number | null;
  monthlyResetAt: string | null;
  creditsRemaining: number | null;
  rateLimit: number | null;
  rateRemaining: number | null;
}

export interface UsageSummary {
  projectId: string;
  plan: string;
  monthlyLimit: number | null;
  monthlyRequestCount: number;
  monthlyRemaining: number | null;
  creditsBalance: number | null;
  resetAt: string | null;
  lastUsedAt: string | null;
  rateLimit: number | null;
  status: string;
  ownerAccountId: string;
}

export interface AccountSignupInput {
  email: string;
}

export interface AccountLoginInput {
  email: string;
}

export interface CreateProjectInput {
  name: string;
  environment?: ProjectEnvironment;
  scopes?: string[];
  monthlyQuota?: number | null;
  rateLimitPerMinute?: number | null;
  initialCredits?: number | null;
}

interface ProjectUsageSummary {
  projectId: string;
  monthlyLimit: number | null;
  monthlyRequestCount: number;
  monthlyRemaining: number | null;
  creditsRemaining: number | null;
  resetAt: string | null;
  lastUsedAt: string | null;
}

interface AccountLookup {
  account: StoredAccount;
  token: string;
}

const DEFAULT_ACCOUNT_DATA_PATH = "./edutuengineapi-data.json";
const DEFAULT_SCOPES = [
  "opportunities:read",
  "opportunities:sync",
  "usage:read",
] as const;
const DEFAULT_BUDGETS = {
  test: {
    monthlyQuota: 250,
    rateLimit: 30,
    initialCredits: 100,
  },
  live: {
    monthlyQuota: 5000,
    rateLimit: 60,
    initialCredits: 2500,
  },
} as const;
const BILING_PLANS: BillingPlan[] = [
  {
    id: "starter-monthly",
    name: "Starter",
    monthlyQuota: 5000,
    rateLimitPerMinute: 60,
    initialCredits: 2500,
    amountCents: 1900,
    currency: "USD",
    interval: "monthly",
  },
  {
    id: "growth-monthly",
    name: "Growth",
    monthlyQuota: 20000,
    rateLimitPerMinute: 180,
    initialCredits: 10000,
    amountCents: 5900,
    currency: "USD",
    interval: "monthly",
  },
  {
    id: "growth-yearly",
    name: "Growth (Yearly)",
    monthlyQuota: 25000,
    rateLimitPerMinute: 200,
    initialCredits: 12000,
    amountCents: 63000,
    currency: "USD",
    interval: "yearly",
  },
];

const ENV_KEY_PREFIXES = ["edu_test_", "edu_live_", "edu_"];

export class ApiKeyStore {
  private readonly filePath: string;
  private readonly data: StorePayload = {
    version: 1,
    accounts: [],
    projects: [],
    events: [],
    invoices: [],
  };
  private readonly rateBuckets = new Map<string, { minuteWindow: number; remaining: number }>();
  private hydrated = false;
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    this.filePath = path.resolve(
      process.cwd(),
      process.env.EDUTU_ENGINE_STORE_PATH || DEFAULT_ACCOUNT_DATA_PATH,
    );
  }

  async signupAccount(input: AccountSignupInput) {
    await this.ensureLoaded();
    const email = input.email.trim().toLowerCase();
    const token = `edutu_dev_${randomBytes(20).toString("hex")}`;
    const now = new Date().toISOString();

    const existing = this.findAccountByEmail(email);
    if (existing) {
      await this.updateAccountToken(existing, token);
      await this.persist();
      return {
        account: this.toPublicAccount(existing, token),
        rawToken: token,
        message:
          "Account already exists for this email. A fresh developer token has been generated.",
      };
    }

    const account: StoredAccount = {
      id: randomUUID(),
      email,
      tokenHash: this.hashToken(token),
      createdAt: now,
      updatedAt: now,
    };

    this.data.accounts.push(account);
    await this.persist();
    return {
      account: this.toPublicAccount(account, token),
      rawToken: token,
      message: "Developer account created successfully.",
    };
  }

  async login(input: AccountLoginInput) {
    await this.ensureLoaded();
    const email = input.email.trim().toLowerCase();
    const account = this.findAccountByEmail(email);
    if (!account) {
      return this.signupAccount({ email });
    }

    const token = `edutu_dev_${randomBytes(20).toString("hex")}`;
    await this.updateAccountToken(account, token);
    await this.persist();

    return {
      account: this.toPublicAccount(account, token),
      rawToken: token,
      message: "Developer login successful.",
    };
  }

  async getAccountByDeveloperToken(token: string) {
    await this.ensureLoaded();
    const hashed = this.hashToken(token);
    const account = this.data.accounts.find((item) => item.tokenHash === hashed);
    if (!account) return null;
    return this.toPublicAccount(account, token);
  }

  async createProject(
    accountToken: string,
    input: CreateProjectInput,
  ): Promise<{ rawKey: string; project: DashboardProject }> {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) {
      throw new Error("Invalid developer token");
    }

    const rawProject = await this.assertAccountIdByToken(accountToken);
    const environment = input.environment || "live";
    const defaults = DEFAULT_BUDGETS[environment];
    const now = new Date().toISOString();
    const keyPrefix = `edu_${environment}_${randomBytes(4).toString("hex")}`;
    const keySecret = randomBytes(18).toString("hex");
    const rawKey = `${keyPrefix}_${keySecret}`;
    const project: StoredProject = {
      id: randomUUID(),
      ownerAccountId: rawProject,
      name: input.name.trim(),
      environment,
      status: "active",
      plan: "starter",
      keyPrefix,
      keyHash: this.hashToken(rawKey),
      allowedScopes:
        input.scopes && input.scopes.length > 0 ? input.scopes : [...DEFAULT_SCOPES],
      monthlyQuota:
        input.monthlyQuota === undefined || input.monthlyQuota === null
          ? defaults.monthlyQuota
          : Number(input.monthlyQuota),
      rateLimitPerMinute:
        input.rateLimitPerMinute === undefined || input.rateLimitPerMinute === null
          ? defaults.rateLimit
          : Number(input.rateLimitPerMinute),
      monthlyPeriodStart: this.currentMonthStart(),
      monthlyRequestCount: 0,
      creditsBalance:
        input.initialCredits === undefined || input.initialCredits === null
          ? defaults.initialCredits
          : Number(input.initialCredits),
      lastUsedAt: null,
      revokedAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.data.projects.push(project);
    await this.persist();
    return {
      rawKey,
      project: this.toPublicProject(project),
    };
  }

  async listProjects(accountToken: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");
    const projects = this.data.projects.filter((project) => {
      return project.ownerAccountId === account.id;
    });

    return projects.map((project) => this.toPublicProject(project));
  }

  async getDashboard(accountToken: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");
    const projects = await this.listProjects(accountToken);
    const events = await Promise.all(
      projects.map((project) => this.getUsageEvents(project.id, 5)),
    );
    const recentRequests = events
      .flatMap((projectEvents, index) => {
        const project = projects[index];
        return projectEvents.map((event) => ({
          ...event,
          consumerId: project.id,
          consumerName: project.name,
          keyPrefix: project.keyPrefix,
          environment: project.environment,
        }));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    const activeProjects = projects.filter((project) => project.status === "active");
    const totalRemainingQuota = projects.reduce(
      (sum, project) =>
        project.usage.monthlyRemaining === null ? sum : sum + project.usage.monthlyRemaining,
      0,
    );
    const totalMonthlyQuota = projects.reduce(
      (sum, project) =>
        project.usage.monthlyLimit === null
          ? sum
          : sum + project.usage.monthlyLimit,
      0,
    );
    const unlimitedProjects = projects.filter(
      (project) => project.usage.monthlyLimit === null,
    ).length;
    const totalRequestsThisMonth = projects.reduce(
      (sum, project) => sum + (project.usage.monthlyRequestCount || 0),
      0,
    );
    const latestActivityAt =
      recentRequests.length > 0 ? recentRequests[0].createdAt : null;

    return {
      account: {
        id: account.id,
        email: account.email,
      },
      summary: {
        totalProjects: projects.length,
        activeProjects: activeProjects.length,
        totalRequestsThisMonth,
        totalMonthlyQuota: totalMonthlyQuota || 0,
        totalRemainingQuota,
        unlimitedProjects,
        latestActivityAt,
      },
      onboarding: [
        {
          title: "Get started in 60 seconds",
          description:
            "Create an API project, copy the key once, and call the feed endpoints with x-api-key or Authorization.",
        },
        {
          title: "Protect your key",
          description:
            "Raw keys are only shown immediately after creation; keep them in your secure secret store.",
        },
      ],
      projects,
      recentRequests,
    } as DeveloperDashboard;
  }

  listPlans(): BillingPlan[] {
    return BILING_PLANS.map((plan) => ({ ...plan }));
  }

  async getPlanById(planId: string) {
    await this.ensureLoaded();
    return BILING_PLANS.find((plan) => plan.id === planId) ?? null;
  }

  async getProjectInvoiceHistory(projectId: string) {
    await this.ensureLoaded();
    return this.data.invoices.filter((invoice) => invoice.projectId === projectId);
  }

  async createCheckoutSession(accountToken: string, projectId: string, planId: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");

    const project = this.findProjectById(projectId);
    if (!project || project.ownerAccountId !== account.id) {
      throw new Error("Project not found");
    }

    const plan = BILING_PLANS.find((entry) => entry.id === planId);
    if (!plan) throw new Error("Unknown billing plan");

    const reference = `inv_${randomBytes(10).toString("hex")}`;
    const invoice: StoredInvoice = {
      id: randomUUID(),
      projectId,
      planId,
      reference,
      amountCents: plan.amountCents,
      currency: "USD",
      status: "pending",
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    this.data.invoices.push(invoice);
    await this.persist();

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return {
        status: "pending",
        invoice: {
          id: invoice.id,
          reference,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          status: invoice.status,
          planId,
          projectId,
        },
        message:
          "PAYSTACK_SECRET_KEY is not configured. Use GET /v1/billing/mock-success to simulate paid transaction.",
      };
    }

    return {
      status: "pending",
      invoice: {
        id: invoice.id,
        reference,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        status: invoice.status,
        planId,
        projectId,
      },
      paystack: {
        enabled: true,
        checkoutSessionHint: `${paystackSecret.slice(0, 5)}...`,
      },
    };
  }

  async markInvoicePaid(projectId: string, reference: string) {
    await this.ensureLoaded();
    const invoice = this.data.invoices.find(
      (entry) => entry.projectId === projectId && entry.reference === reference,
    );
    if (!invoice || invoice.status !== "pending") {
      return null;
    }

    const project = this.findProjectById(projectId);
    if (!project) return null;

    const plan = BILING_PLANS.find((entry) => entry.id === invoice.planId);
    if (!plan) return null;

    project.monthlyQuota = plan.monthlyQuota;
    project.rateLimitPerMinute = plan.rateLimitPerMinute;
    project.creditsBalance =
      (project.creditsBalance ?? 0) + plan.initialCredits;
    project.plan = plan.name;
    project.updatedAt = new Date().toISOString();
    invoice.status = "paid";
    invoice.paidAt = new Date().toISOString();
    await this.persist();

    return {
      id: invoice.id,
      projectId,
      planId: invoice.planId,
      paidAt: invoice.paidAt,
      status: invoice.status,
    };
  }

  async getUsageSummary(accountToken: string, projectId: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");

    const project = this.findProjectById(projectId);
    if (!project || project.ownerAccountId !== account.id) {
      throw new Error("Project not found");
    }

    const usage = await this.getUsageForProject(projectId);
    const invoices = await this.getProjectInvoiceHistory(projectId);
    return {
      usage,
      project: this.toPublicProject(project),
      invoices: invoices
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  async rotateProject(accountToken: string, projectId: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");

    const project = this.findProjectById(projectId);
    if (!project || project.ownerAccountId !== account.id) {
      throw new Error("Project not found");
    }

    const keySecret = randomBytes(18).toString("hex");
    const rawKey = `${project.keyPrefix}_${keySecret}`;
    project.keyHash = this.hashToken(rawKey);
    project.updatedAt = new Date().toISOString();
    project.status = "active";
    project.revokedAt = null;
    await this.persist();

    return {
      rawKey,
      project: this.toPublicProject(project),
    };
  }

  async revokeProject(accountToken: string, projectId: string) {
    await this.ensureLoaded();
    const account = await this.getAccountByDeveloperToken(accountToken);
    if (!account) throw new Error("Invalid developer token");

    const project = this.findProjectById(projectId);
    if (!project || project.ownerAccountId !== account.id) {
      throw new Error("Project not found");
    }
    if (project.status === "revoked") {
      return this.toPublicProject(project);
    }

    project.status = "revoked";
    project.revokedAt = new Date().toISOString();
    project.updatedAt = project.revokedAt;
    await this.persist();
    return this.toPublicProject(project);
  }

  async resolveConsumer(apiKey: string): Promise<ApiConsumerContext | null> {
    await this.ensureLoaded();
    const envConsumer = this.resolveEnvConsumer(apiKey);
    if (envConsumer) return envConsumer;

    const normalized = this.hashToken(apiKey);
    const project = this.data.projects.find(
      (record) =>
        this.safeCompareHash(record.keyHash, normalized) && record.status === "active",
    );
    if (!project) return null;

    if (this.isExpired(project)) {
      project.status = "expired";
      await this.persist();
      return null;
    }

    return this.toConsumerContext(project);
  }

  async reserveProjectBudget(context: ApiConsumerContext, endpoint: string) {
    await this.ensureLoaded();
    const project = this.findProjectById(context.projectId);
    if (!project) {
      return {
        allowed: false,
        monthlyLimit: null,
        monthlyRemaining: null,
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: null,
        rateLimit: null,
        rateRemaining: null,
      } as UsageBudget;
    }

    if (this.isFreeEndpoint(endpoint)) {
      return this.consumeMonthlyAndRefresh(project, endpoint, context, false);
    }
    return this.consumeMonthlyAndRefresh(project, endpoint, context, true);
  }

  async getUsageForProject(projectId: string): Promise<ProjectUsageSummary | null> {
    await this.ensureLoaded();
    const project = this.findProjectById(projectId);
    if (!project) return null;

    const periodStart = this.currentMonthStart();
    const resetAt = this.currentMonthResetAt();
    const rawMonthly = project.monthlyPeriodStart === periodStart
      ? project.monthlyRequestCount
      : 0;
    const remaining =
      project.monthlyQuota === null
        ? null
        : Math.max(project.monthlyQuota - rawMonthly, 0);

    return {
      projectId: project.id,
      monthlyLimit: project.monthlyQuota,
      monthlyRequestCount: rawMonthly,
      monthlyRemaining: remaining,
      creditsRemaining: project.creditsBalance,
      resetAt,
      lastUsedAt: project.lastUsedAt,
    };
  }

  async getUsageEvents(projectId: string, limit = 25) {
    await this.ensureLoaded();
    return this.data.events
      .filter((event) => event.projectId === projectId)
      .slice(-Math.min(Math.max(limit, 1), 100))
      .reverse();
  }

  async recordUsageEvent(input: {
    projectId: string;
    requestId: string;
    method: string;
    endpoint: string;
    statusCode: number;
    latencyMs: number;
  }) {
    await this.ensureLoaded();
    this.data.events.push({
      id: randomUUID(),
      projectId: input.projectId,
      requestId: input.requestId,
      method: input.method,
      endpoint: input.endpoint,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      createdAt: new Date().toISOString(),
    });
    if (this.data.events.length > 1000) {
      this.data.events = this.data.events.slice(-1000);
    }
    await this.persist();
  }

  private async consumeMonthlyAndRefresh(
    project: StoredProject,
    endpoint: string,
    context: ApiConsumerContext,
    chargeCredit: boolean,
  ): Promise<UsageBudget> {
    const rateBudget = this.consumeRateLimit(context);
    if (!rateBudget.allowed) {
      return {
        allowed: false,
        monthlyLimit: project.monthlyQuota,
        monthlyRemaining:
          project.monthlyQuota === null ? null : Math.max(project.monthlyQuota - project.monthlyRequestCount, 0),
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: project.creditsBalance,
        rateLimit: rateBudget.monthlyLimit,
        rateRemaining: rateBudget.remaining,
      };
    }

    if (project.monthlyQuota === null) {
      if (!chargeCredit) {
        return {
          allowed: true,
          monthlyLimit: null,
          monthlyRemaining: null,
          monthlyResetAt: this.currentMonthResetAt(),
          creditsRemaining: project.creditsBalance,
          rateLimit: rateBudget.monthlyLimit,
          rateRemaining: rateBudget.remaining,
        };
      }
      return this.consumeCredit(project, rateBudget);
    }

    if (project.monthlyPeriodStart !== this.currentMonthStart()) {
      project.monthlyPeriodStart = this.currentMonthStart();
      project.monthlyRequestCount = 0;
      project.updatedAt = new Date().toISOString();
    }

    if (project.monthlyRequestCount >= project.monthlyQuota) {
      project.updatedAt = new Date().toISOString();
      await this.persist();
      return {
        allowed: false,
        monthlyLimit: project.monthlyQuota,
        monthlyRemaining: 0,
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: project.creditsBalance,
        rateLimit: rateBudget.monthlyLimit,
        rateRemaining: rateBudget.remaining,
      };
    }

    project.monthlyRequestCount += 1;
    project.lastUsedAt = new Date().toISOString();
    project.updatedAt = project.lastUsedAt;

    if (!chargeCredit) {
      await this.persist();
      return {
        allowed: true,
        monthlyLimit: project.monthlyQuota,
        monthlyRemaining: Math.max(project.monthlyQuota - project.monthlyRequestCount, 0),
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: project.creditsBalance,
        rateLimit: rateBudget.monthlyLimit,
        rateRemaining: rateBudget.remaining,
      };
    }

    return this.consumeCredit(project, rateBudget);
  }

  private async consumeCredit(
    project: StoredProject,
    rateBudget: { monthlyLimit: number | null; remaining: number | null; allowed: boolean },
  ) {
    if (project.creditsBalance === null) {
      await this.persist();
      return {
        allowed: true,
        monthlyLimit: project.monthlyQuota,
        monthlyRemaining:
          project.monthlyQuota === null
            ? null
            : Math.max(project.monthlyQuota - project.monthlyRequestCount, 0),
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: project.creditsBalance,
        rateLimit: rateBudget.monthlyLimit,
        rateRemaining: rateBudget.remaining,
      };
    }

    if (project.creditsBalance <= 0) {
      await this.persist();
      return {
        allowed: false,
        monthlyLimit: project.monthlyQuota,
        monthlyRemaining:
          project.monthlyQuota === null
            ? null
            : Math.max(project.monthlyQuota - project.monthlyRequestCount, 0),
        monthlyResetAt: this.currentMonthResetAt(),
        creditsRemaining: project.creditsBalance,
        rateLimit: rateBudget.monthlyLimit,
        rateRemaining: rateBudget.remaining,
      };
    }

    project.creditsBalance = Math.max(project.creditsBalance - 1, 0);
    await this.persist();
    return {
      allowed: true,
      monthlyLimit: project.monthlyQuota,
      monthlyRemaining:
        project.monthlyQuota === null
          ? null
          : Math.max(project.monthlyQuota - project.monthlyRequestCount, 0),
      monthlyResetAt: this.currentMonthResetAt(),
      creditsRemaining: project.creditsBalance,
      rateLimit: rateBudget.monthlyLimit,
      rateRemaining: rateBudget.remaining,
    };
  }

  private consumeRateLimit(context: ApiConsumerContext) {
    const key = `${context.id}:minute`;
    const bucket = this.rateBuckets.get(key) ?? {
      minuteWindow: this.currentMinute(),
      remaining: context.rateLimitPerMinute ?? 60,
    };
    const limit = context.rateLimitPerMinute ?? 60;

    if (bucket.minuteWindow !== this.currentMinute()) {
      bucket.minuteWindow = this.currentMinute();
      bucket.remaining = limit;
    }

    if (bucket.remaining <= 0) {
      this.rateBuckets.set(key, bucket);
      return {
        allowed: false,
        monthlyLimit: limit,
        remaining: bucket.remaining,
      };
    }

    bucket.remaining -= 1;
    this.rateBuckets.set(key, bucket);
    return { allowed: true, monthlyLimit: limit, remaining: bucket.remaining };
  }

  private resolveEnvConsumer(apiKey: string): ApiConsumerContext | null {
    const configuredKeys = (process.env.EDUTU_ENGINE_API_KEYS || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const candidate = this.hashToken(apiKey);
    const hasMatch = configuredKeys.some((configured) => {
      if (!configured) return false;
      const configuredHash = configured.startsWith("sha256:")
        ? configured.slice(7)
        : this.hashToken(configured);
      return this.safeCompareHash(configuredHash, candidate);
    });
    if (!hasMatch) return null;

    return {
      id: "env-key",
      projectId: "env-key",
      name: "Environment API key",
      plan: "internal",
      keyPrefix: apiKey.includes("edu_test_")
        ? "edu_test_env"
        : apiKey.includes("edu_live_")
          ? "edu_live_env"
          : "edu_env",
      scopes: ["*"],
      environment: "live",
      monthlyQuota: null,
      rateLimitPerMinute: null,
      ownerAccountId: null,
      status: "active",
      remainingQuota: null,
      quotaLimit: null,
      quotaResetAt: null,
      creditsBalance: null,
    };
  }

  private toConsumerContext(project: StoredProject): ApiConsumerContext {
    return {
      id: project.id,
      projectId: project.id,
      name: project.name,
      plan: project.plan,
      keyPrefix: project.keyPrefix,
      scopes: project.allowedScopes,
      environment: project.environment,
      monthlyQuota: project.monthlyQuota,
      rateLimitPerMinute: project.rateLimitPerMinute,
      ownerAccountId: project.ownerAccountId,
      status: project.status,
    };
  }

  private toPublicProject(project: StoredProject) {
    const resetAt = this.currentMonthResetAt();
    const usage =
      project.monthlyQuota === null
        ? null
        : Math.max(project.monthlyQuota - project.monthlyRequestCount, 0);
    return {
      id: project.id,
      name: project.name,
      environment: project.environment,
      status: project.status,
      plan: project.plan,
      keyPrefix: project.keyPrefix,
      scopes: project.allowedScopes,
      monthlyQuota: project.monthlyQuota,
      rateLimitPerMinute: project.rateLimitPerMinute,
      creditsBalance: project.creditsBalance,
      usage: {
        monthlyLimit: project.monthlyQuota,
        monthlyRequestCount: project.monthlyRequestCount,
        monthlyRemaining: usage,
        monthlyResetAt: resetAt,
        lastUsedAt: project.lastUsedAt,
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      revokedAt: project.revokedAt,
      expiresAt: project.expiresAt,
    };
  }

  private toPublicAccount(account: StoredAccount, rawToken: string) {
    return {
      id: account.id,
      email: account.email,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      developerToken: rawToken,
    };
  }

  private toPublicDashboard(account: StoredAccount, projects: ReturnType<ApiKeyStore["listProjects"]>) {
    return { account: this.toPublicAccount(account, ""), projects };
  }

  private findAccountByEmail(email: string) {
    return this.data.accounts.find((item) => item.email === email);
  }

  private findProjectById(projectId: string) {
    return this.data.projects.find((project) => project.id === projectId);
  }

  private async assertAccountIdByToken(token: string) {
    const account = await this.getAccountByDeveloperToken(token);
    if (!account) throw new Error("Invalid developer token");
    return account.id;
  }

  private async updateAccountToken(account: StoredAccount, token: string) {
    account.tokenHash = this.hashToken(token);
    account.updatedAt = new Date().toISOString();
  }

  private isFreeEndpoint(pathname: string) {
    return /\/v1\/(usage|health|developer|openapi\.json|docs)/i.test(pathname);
  }

  private isExpired(project: StoredProject) {
    if (!project.expiresAt) return false;
    const expiresAt = new Date(project.expiresAt).getTime();
    return Number.isNaN(expiresAt) ? false : expiresAt <= Date.now();
  }

  private currentMonthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  }

  private currentMonthResetAt() {
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString();
    return next;
  }

  private currentMinute() {
    return Math.floor(Date.now() / 60000);
  }

  private hashToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private safeCompareHash(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async ensureLoaded() {
    if (this.hydrated) return;
    if (!this.loadingPromise) {
      this.loadingPromise = this.load();
    }
    await this.loadingPromise;
    this.hydrated = true;
    this.loadingPromise = null;
  }

  private async load() {
    try {
      const fileContent = await fs.readFile(this.filePath, "utf8");
      const loaded = JSON.parse(fileContent) as Partial<StorePayload>;
      if (loaded && loaded.version === 1) {
        this.data.version = 1;
        this.data.accounts = loaded.accounts || [];
        this.data.projects = loaded.projects || [];
        this.data.events = loaded.events || [];
        this.data.invoices = loaded.invoices || [];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.persist();
      } else {
        throw error;
      }
    }
  }

  private async persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(
        {
          version: this.data.version,
          accounts: this.data.accounts,
          projects: this.data.projects,
          events: this.data.events,
          invoices: this.data.invoices,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
