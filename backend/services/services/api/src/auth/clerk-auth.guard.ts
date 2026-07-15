import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ClerkClient } from "@clerk/backend";
import { verifyToken } from "@clerk/backend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { db } from "../db";
import { profiles } from "../db/schema";
import { matchProfileUserId, toDatabaseUserId } from "../common/user-id";
import {
  getExpectedClerkIssuer,
  verifyClerkTokenViaJwks,
  type ClerkJwksClaims,
} from "./clerk-jwks";

const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;
const TRUSTED_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "moderator",
  "support_agent",
]);

// Stamp profiles.last_seen_at at most once per user per window — the
// active-user metric is day/week-granular, so per-request writes are waste.
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private supabaseClients: SupabaseClient[] | null = null;
  private lastSeenStamps = new Map<string, number>();

  constructor(
    private reflector: Reflector,
    @Inject("ClerkClient") private clerkClient: ClerkClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    if (this.tryAuthenticateLocalAdmin(request)) {
      return true;
    }

    const authHeader = request.headers.authorization;

    if (typeof authHeader !== "string") {
      throw new UnauthorizedException("No authorization header provided");
    }

    const token = authHeader.match(BEARER_TOKEN_PATTERN)?.[1]?.trim();
    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    const clerkAuthenticated = await this.tryAuthenticateClerk(token, request);
    if (clerkAuthenticated) {
      return true;
    }

    const supabaseAuthenticated = await this.tryAuthenticateSupabase(
      token,
      request,
    );
    if (supabaseAuthenticated) {
      return true;
    }

    throw new UnauthorizedException("Invalid or expired token");
  }

  private tryAuthenticateLocalAdmin(request: any): boolean {
    // SECURITY: the local-admin bypass must never be usable in production,
    // regardless of how the env vars are configured.
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    if (process.env.EDUTU_LOCAL_ADMIN_BYPASS !== "true") {
      return false;
    }

    const emailHeader = request.headers["x-edutu-admin-email"];
    const email = Array.isArray(emailHeader) ? emailHeader[0] : emailHeader;
    if (typeof email !== "string" || !email.trim()) return false;

    request.user = {
      id: `local-admin:${email.toLowerCase()}`,
      authId: `local-admin:${email.toLowerCase()}`,
      email: email.toLowerCase(),
      role: "super_admin",
      authProvider: "local-dev",
    };

    return true;
  }

  // Tracks whether Clerk verification is even possible, so we warn ONCE at
  // boot-ish rather than on every request if the instance is unconfigured.
  private warnedNoClerkConfig = false;

  private async verifyClerkToken(
    token: string,
  ): Promise<({ sub: string } & Record<string, unknown>) | null> {
    // Primary: Clerk SDK (secret key, or CLERK_JWT_KEY for networkless verify).
    const secretKey = process.env.CLERK_SECRET_KEY;
    const jwtKey = process.env.CLERK_JWT_KEY;
    if (secretKey || jwtKey) {
      try {
        return await verifyToken(token, { secretKey, jwtKey });
      } catch {
        // Fall through to the JWKS path — a wrong/missing secret key must not
        // be the end of the line, or every Clerk user 401s (a real outage).
      }
    }

    // Fallback: verify the signature directly against the instance JWKS. Needs
    // no Clerk API key, so it self-heals when CLERK_SECRET_KEY is absent.
    const viaJwks: ClerkJwksClaims | null = await verifyClerkTokenViaJwks(
      token,
    ).catch(() => null);
    if (viaJwks) return viaJwks;

    if (
      !secretKey &&
      !jwtKey &&
      !getExpectedClerkIssuer() &&
      !this.warnedNoClerkConfig
    ) {
      this.warnedNoClerkConfig = true;
      console.error(
        "[ClerkAuthGuard] Clerk verification unavailable: set CLERK_SECRET_KEY (or CLERK_JWT_KEY / CLERK_ISSUER_URL / a CLERK_PUBLISHABLE_KEY). All Clerk-authenticated requests will 401 until then.",
      );
    }
    return null;
  }

  private async tryAuthenticateClerk(
    token: string,
    request: any,
  ): Promise<boolean> {
    try {
      const payload = await this.verifyClerkToken(token);
      if (!payload?.sub) return false;

      const dbUserId = toDatabaseUserId(payload.sub);
      // Profiles are keyed by the raw auth subject (canonical). Resolve the row
      // via the dual-key matcher so a legacy derived-uuid row still hydrates
      // role/email while the merge migration catches up.
      const profile = await this.findProfile(dbUserId);
      const clerkUser = profile
        ? null
        : await this.safeGetClerkUser(payload.sub);

      request.user = {
        id: dbUserId,
        authId: payload.sub,
        email:
          this.toStringClaim(payload.email) ||
          profile?.email ||
          clerkUser?.primaryEmailAddress?.emailAddress,
        firstName:
          this.toStringClaim(payload.first_name) ||
          profile?.fullName?.split(" ")[0] ||
          clerkUser?.firstName,
        lastName: this.toStringClaim(payload.last_name) || clerkUser?.lastName,
        role:
          profile?.role ||
          this.getTrustedRoleFromMetadata(clerkUser?.publicMetadata) ||
          "user",
        authProvider: "clerk",
      };

      // Active-user tracking: mark the account active the moment any
      // authenticated request arrives (covers Google/Clerk sign-ins that
      // previously never wrote last_seen_at). Fire-and-forget. Keyed by the
      // raw Clerk subject so the stamp lands on the canonical profile row.
      this.touchLastSeen(
        payload.sub,
        request.user.email,
        request.user.firstName,
      );

      return true;
    } catch {
      return false;
    }
  }

  private async tryAuthenticateSupabase(
    token: string,
    request: any,
  ): Promise<boolean> {
    const clients = this.getSupabaseClients();
    if (clients.length === 0) return false;

    for (const supabase of clients) {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);

        if (error || !user) continue;

        const dbUserId = toDatabaseUserId(user.id);
        const profile = await this.safeFindProfile(dbUserId);

        request.user = {
          id: dbUserId,
          authId: user.id,
          email: user.email || profile?.email,
          firstName: profile?.fullName?.split(" ")[0],
          lastName: undefined,
          role:
            profile?.role ||
            this.getTrustedRoleFromMetadata(user.app_metadata) ||
            "user",
          authProvider: "supabase",
        };

        this.touchLastSeen(
          dbUserId,
          request.user.email,
          request.user.firstName,
        );

        return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Throttled, fire-and-forget active-user stamp. Upserts so brand-new
   * users (e.g. first Google login, before any GET /profile) still count
   * toward active-user metrics; on conflict only last_seen_at is touched.
   */
  private touchLastSeen(
    profileKey: string,
    email?: string,
    firstName?: string,
  ) {
    const now = Date.now();
    const lastStamp = this.lastSeenStamps.get(profileKey);
    if (lastStamp && now - lastStamp < LAST_SEEN_THROTTLE_MS) return;
    this.lastSeenStamps.set(profileKey, now);

    // Bound the in-memory throttle map (per-instance; a reset just means
    // one extra write).
    if (this.lastSeenStamps.size > 10_000) {
      this.lastSeenStamps.clear();
      this.lastSeenStamps.set(profileKey, now);
    }

    void db
      .insert(profiles)
      .values({
        userId: profileKey,
        email: email ?? null,
        fullName: firstName ?? null,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { lastSeenAt: new Date() },
      })
      .execute()
      .catch(() => {
        // Never block or fail auth over metrics; allow a retry next window.
        this.lastSeenStamps.delete(profileKey);
      });
  }

  private getSupabaseClients(): SupabaseClient[] {
    if (this.supabaseClients) return this.supabaseClients;

    const url = process.env.SUPABASE_URL;
    if (!url) {
      this.supabaseClients = [];
      return this.supabaseClients;
    }

    const keys = [
      process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_KEY,
    ].filter((key): key is string => Boolean(key && key.trim()));

    const uniqueKeys = Array.from(new Set(keys));

    this.supabaseClients = uniqueKeys.map((key) =>
      createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }),
    );

    return this.supabaseClients;
  }

  private async findProfile(derivedUserId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(matchProfileUserId(profiles.userId, derivedUserId))
      .execute();

    return profile || null;
  }

  private async safeFindProfile(userId: string) {
    try {
      return await this.findProfile(userId);
    } catch {
      return this.findProfileWithSupabase(userId);
    }
  }

  private async findProfileWithSupabase(userId: string) {
    const supabase = this.getSupabaseAdminClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        userId: data.user_id,
        email: data.email,
        fullName: data.full_name,
        role: data.role,
      };
    } catch {
      return null;
    }
  }

  private getSupabaseAdminClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return null;

    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  private async safeGetClerkUser(userId: string) {
    try {
      return await this.clerkClient.users.getUser(userId);
    } catch {
      return null;
    }
  }

  private getTrustedRoleFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const role = (metadata as Record<string, unknown>).role;
    if (typeof role !== "string") {
      return null;
    }

    return TRUSTED_ADMIN_ROLES.has(role) ? role : null;
  }

  private toStringClaim(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }
}
