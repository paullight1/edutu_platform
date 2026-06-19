import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ClerkClient } from "@clerk/clerk-sdk-node";
import { verifyToken } from "@clerk/clerk-sdk-node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { db } from "../db";
import { profiles } from "../db/schema";
import { eq } from "drizzle-orm";
import { toDatabaseUserId } from "../common/user-id";

const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;
const TRUSTED_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "moderator",
  "support_agent",
]);

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private supabaseClients: SupabaseClient[] | null = null;

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

  private async tryAuthenticateClerk(
    token: string,
    request: any,
  ): Promise<boolean> {
    if (!process.env.CLERK_SECRET_KEY) return false;

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const dbUserId = toDatabaseUserId(payload.sub);
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

        return true;
      } catch {
        continue;
      }
    }

    return false;
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

    this.supabaseClients = uniqueKeys.map((key) => createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }));

    return this.supabaseClients;
  }

  private async findProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();

    return profile || null;
  }

  private async safeFindProfile(userId: string) {
    try {
      return await this.findProfile(userId);
    } catch {
      return null;
    }
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
