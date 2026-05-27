import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Edutu API';
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'edutu-api',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
    const checks = {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      supabaseUrl: Boolean(process.env.SUPABASE_URL),
      supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      clerkSecret: Boolean(process.env.CLERK_SECRET_KEY),
      geminiKey: Boolean(process.env.GEMINI_API_KEY),
    };
    const ready = Object.values(checks).every(Boolean);

    return {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
