import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): string {
    return "Edutu API";
  }

  getHealth() {
    return {
      status: "ok",
      service: "edutu-api",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
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

    return {
      status: ready ? "ready" : "not_ready",
      checks,
      supabaseProjectRef,
      timestamp: new Date().toISOString(),
    };
  }
}
