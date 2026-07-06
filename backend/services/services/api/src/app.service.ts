import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "./db";

@Injectable()
export class AppService {
  // pgvector presence can't change without a migration + restart, so probe
  // once and cache for the process lifetime.
  private pgvectorAvailable: boolean | null = null;

  getHello(): string {
    return "Edutu API";
  }

  private async checkPgvector(): Promise<boolean> {
    if (this.pgvectorAvailable !== null) return this.pgvectorAvailable;
    try {
      const result = await db.execute(
        sql`select 1 from pg_extension where extname = 'vector'`,
      );
      this.pgvectorAvailable =
        ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
    } catch {
      // DB unreachable — report missing but don't pin the cached value.
      return false;
    }
    return this.pgvectorAvailable;
  }

  getHealth() {
    return {
      status: "ok",
      service: "edutu-api",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const supabaseProjectRef = (() => {
      try {
        return process.env.SUPABASE_URL
          ? new URL(process.env.SUPABASE_URL).hostname.split(".")[0]
          : null;
      } catch {
        return null;
      }
    })();

    const checks = {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      supabaseUrl: Boolean(process.env.SUPABASE_URL),
      supabaseAnonKey: Boolean(
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY,
      ),
      supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      clerkSecret: Boolean(process.env.CLERK_SECRET_KEY),
      deepseekKey: Boolean(process.env.DEEPSEEK_API_KEY),
      geminiKey: Boolean(process.env.GEMINI_API_KEY),
    };
    const ready =
      checks.databaseUrl &&
      checks.supabaseUrl &&
      checks.supabaseServiceRole &&
      checks.clerkSecret &&
      checks.deepseekKey;

    // Recommendation-engine health: informational, never gates readiness —
    // the engine degrades to the heuristic ranker when either is missing.
    const pgvector = await this.checkPgvector();
    const recommendations = {
      pgvector: pgvector ? "available" : "missing",
      embeddings: checks.geminiKey ? "configured" : "degraded",
      engine: (process.env.RECS_ENGINE || "hybrid").toLowerCase(),
    };

    return {
      status: ready ? "ready" : "not_ready",
      checks,
      recommendations,
      supabaseProjectRef,
      timestamp: new Date().toISOString(),
    };
  }
}
