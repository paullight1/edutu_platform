import { getApiBaseUrl } from "../lib/apiBaseUrl";

export type DeveloperEnvironment = "test" | "live";

export type DeveloperProjectSummary = {
  id: string;
  name: string;
  contactEmail: string | null;
  keyPrefix: string | null;
  status: string;
  plan: string;
  environment: string | null;
  scopes: string[];
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
  requestCount: number;
  remainingQuota: number | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DeveloperRequestSummary = {
  id: string;
  requestId: string | null;
  method: string;
  endpoint: string;
  statusCode: number | null;
  latencyMs: number | null;
  createdAt: string | null;
  consumerId: string;
  consumerName: string;
  keyPrefix: string | null;
  environment: string | null;
};

export type DeveloperDashboard = {
  account: {
    userId: string;
    email: string | null;
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
  projects: DeveloperProjectSummary[];
  recentRequests: DeveloperRequestSummary[];
};

export type CreateDeveloperProjectInput = {
  name: string;
  environment: DeveloperEnvironment;
  scopes: string[];
  monthlyQuota?: number;
  rateLimitPerMinute?: number;
};

export type CreateDeveloperProjectResult = {
  rawKey: string;
  project: DeveloperProjectSummary;
};

async function requestDeveloper<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Developer API");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.message ||
      data?.error?.message ||
      "Developer request failed";
    throw new Error(message);
  }

  return data as T;
}

export function getDeveloperDashboard(token: string) {
  return requestDeveloper<DeveloperDashboard>("/developer/dashboard", token);
}

export function createDeveloperProject(
  token: string,
  input: CreateDeveloperProjectInput,
) {
  return requestDeveloper<CreateDeveloperProjectResult>(
    "/developer/projects",
    token,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function rotateDeveloperProject(token: string, projectId: string) {
  return requestDeveloper<CreateDeveloperProjectResult>(
    `/developer/projects/${projectId}/rotate`,
    token,
    {
      method: "POST",
    },
  );
}

export function revokeDeveloperProject(token: string, projectId: string) {
  return requestDeveloper<DeveloperProjectSummary>(
    `/developer/projects/${projectId}`,
    token,
    {
      method: "DELETE",
    },
  );
}
