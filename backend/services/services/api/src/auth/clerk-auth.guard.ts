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

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private supabase: SupabaseClient | null = null;

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

      request.user = {
        id: dbUserId,
        authId: payload.sub,
        email: payload.email || profile?.email,
        firstName: payload.first_name || profile?.fullName?.split(" ")[0],
        lastName: payload.last_name,
        role: profile?.role || "user",
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
    const supabase = this.getSupabaseClient();
    if (!supabase) return false;

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) return false;

      const dbUserId = toDatabaseUserId(user.id);
      const profile = await this.findProfile(dbUserId);

      request.user = {
        id: dbUserId,
        authId: user.id,
        email: user.email || profile?.email,
        firstName: profile?.fullName?.split(" ")[0],
        lastName: undefined,
        role: profile?.role || "user",
        authProvider: "supabase",
      };

      return true;
    } catch {
      return false;
    }
  }

  private getSupabaseClient(): SupabaseClient | null {
    if (this.supabase) return this.supabase;

    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    this.supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    return this.supabase;
  }

  private async findProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();

    return profile || null;
  }
}
