import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";
import { MonetizationService } from "./monetization.service";

type ModuleAccess = "free" | "pro" | "disabled";
type ModuleKey = "chat" | "cv" | "copilot" | "roadmaps" | "savedSearches";
type GuardRequest = {
  originalUrl?: string;
  url?: string;
  method?: string;
  user?: { id?: string };
};

interface ToolRoute {
  moduleKey: ModuleKey | null;
  requiresPaidWebPlan: boolean;
}

const MODULE_LOCK_CACHE_MS = 5_000;
const MODULE_KEYS = new Set<ModuleKey>([
  "chat",
  "cv",
  "copilot",
  "roadmaps",
  "savedSearches",
]);
const ROUTE_ROOTS = new Set([
  "chat",
  "cv",
  "copilot",
  "goals",
  "roadmaps",
  "saved-searches",
  "uploads",
]);

/**
 * Keeps the mobile compatibility paths, but applies web plan rules to the
 * equivalent `/web-tools` requests and applies configured module locks to
 * both aliases. Metered Coach and roadmap generation remain free to reach the
 * canonical AI meter, which decides whether the user has allowance or credits.
 */
@Injectable()
export class WebPaidToolsGuard implements CanActivate {
  private moduleLocksCache: {
    expiresAt: number;
    locks: Record<string, ModuleAccess>;
  } | null = null;
  private moduleLocksRefresh: Promise<Record<string, ModuleAccess>> | null = null;

  constructor(
    private readonly monetization: MonetizationService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const route = this.resolveRoute(
      request.originalUrl || request.url || "",
      request.method || "GET",
    );
    if (!route.moduleKey && !route.requiresPaidWebPlan) return true;

    const locks = await this.getModuleLocks();
    const moduleAccess = route.moduleKey
      ? (locks[route.moduleKey] ?? "free")
      : "free";

    if (moduleAccess === "disabled") {
      throw new ForbiddenException({
        code: "module_disabled",
        message: "This Edutu feature is temporarily unavailable.",
      });
    }

    const requiresPaidPlan =
      route.requiresPaidWebPlan || moduleAccess === "pro";
    if (!requiresPaidPlan) return true;
    if (!request.user?.id) throw new UnauthorizedException();

    const policy = await this.monetization.getActionPolicy(request.user.id);
    if (policy.planTier === "none") {
      throw new HttpException(
        {
          code: "paid_plan_required",
          message:
            "An active Edutu paid plan is required for this preparation tool.",
        },
        402,
      );
    }
    return true;
  }

  private resolveRoute(rawUrl: string, method: string): ToolRoute {
    const segments = rawUrl.split(/[?#]/, 1)[0].split("/").filter(Boolean);
    const webToolsIndex = segments.indexOf("web-tools");
    const rootIndex =
      webToolsIndex >= 0
        ? webToolsIndex + 1
        : segments.findIndex((segment) => ROUTE_ROOTS.has(segment));
    if (rootIndex < 0 || rootIndex >= segments.length) {
      return {
        moduleKey: null,
        requiresPaidWebPlan: webToolsIndex >= 0,
      };
    }

    const root = segments[rootIndex];
    const rest = segments.slice(rootIndex + 1);
    const isWebToolRoute = webToolsIndex >= 0;
    const verb = method.toUpperCase();

    if (root === "chat") {
      return { moduleKey: "chat", requiresPaidWebPlan: false };
    }
    if (root === "cv") {
      const paidAiAction =
        rest[0] === "ai" &&
        (rest[1] === "tailor" || rest[1] === "cover-letter");
      return {
        moduleKey: "cv",
        requiresPaidWebPlan: isWebToolRoute && paidAiAction,
      };
    }
    if (root === "copilot") {
      return { moduleKey: "copilot", requiresPaidWebPlan: isWebToolRoute };
    }
    if (root === "goals") {
      return { moduleKey: "roadmaps", requiresPaidWebPlan: isWebToolRoute };
    }
    if (root === "saved-searches") {
      return {
        moduleKey: "savedSearches",
        requiresPaidWebPlan: isWebToolRoute,
      };
    }
    if (root === "uploads") {
      const isIngest = rest.length === 2 && rest[1] === "ingest";
      const isRead = verb === "GET";
      return {
        moduleKey: null,
        // Listing/reading owned files and parsing them support free metered AI.
        // Creating a new upload from the paid Documents workspace is gated.
        requiresPaidWebPlan:
          isWebToolRoute && !isRead && !isIngest,
      };
    }
    if (root !== "roadmaps") {
      return { moduleKey: null, requiresPaidWebPlan: isWebToolRoute };
    }

    const isMeteredRoadmapAi =
      rest[0] === "ai" &&
      (rest[1] === "assist" || rest[1] === "opportunity-plan");
    const isPrivateRoadmapRoute =
      rest[0] === "mine" ||
      [
        "adopt",
        "enroll",
        "my-enrollments",
        "progress",
        "intent",
        "recommended",
        "enrollments",
      ].includes(rest[0]);
    return {
      moduleKey: "roadmaps",
      requiresPaidWebPlan:
        isWebToolRoute && isPrivateRoadmapRoute && !isMeteredRoadmapAi,
    };
  }

  private async getModuleLocks(): Promise<Record<string, ModuleAccess>> {
    const now = Date.now();
    if (this.moduleLocksCache && this.moduleLocksCache.expiresAt > now) {
      return this.moduleLocksCache.locks;
    }
    if (!this.moduleLocksRefresh) {
      this.moduleLocksRefresh = this.settings
        .getSettings()
        .then(({ settings, success }) => {
          if (!success) return {};
          const configured = settings.mobileApp?.moduleLocks ?? {};
          const locks: Record<string, ModuleAccess> = {};
          for (const [key, access] of Object.entries(configured)) {
            if (
              MODULE_KEYS.has(key as ModuleKey) &&
              (access === "free" || access === "pro" || access === "disabled")
            ) {
              locks[key] = access;
            }
          }
          return locks;
        })
        .catch(() => ({}))
        .finally(() => {
          this.moduleLocksRefresh = null;
        });
    }

    const locks = await this.moduleLocksRefresh;
    this.moduleLocksCache = {
      locks,
      expiresAt: Date.now() + MODULE_LOCK_CACHE_MS,
    };
    return locks;
  }
}
