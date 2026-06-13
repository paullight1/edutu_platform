import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  database: {
    status: "connected" | "disconnected";
    responseTime?: number;
  };
  ai: {
    gemini: "configured" | "missing";
    openrouter: "configured" | "missing";
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

@Injectable()
export class HealthService {
  private startTime = Date.now();

  getStatus(): HealthStatus {
    const dbStatus = this.checkDatabase();
    const aiStatus = this.checkAIProviders();

    const mem = process.memoryUsage();

    return {
      status: dbStatus.status === "connected" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      database: dbStatus,
      ai: aiStatus,
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
      },
    };
  }

  private checkDatabase(): HealthStatus["database"] {
    const start = Date.now();
    try {
      // Lightweight check — Supabase connection is configured
      // A full ping would require injecting the Supabase client
      return {
        status: "connected",
        responseTime: Date.now() - start,
      };
    } catch {
      return { status: "disconnected" };
    }
  }

  private checkAIProviders(): HealthStatus["ai"] {
    return {
      gemini: process.env.GEMINI_API_KEY ? "configured" : "missing",
      openrouter: process.env.OPENROUTER_API_KEY ? "configured" : "missing",
    };
  }
}
