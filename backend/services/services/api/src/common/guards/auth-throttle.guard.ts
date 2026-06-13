import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../errors';

interface ThrottleEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthThrottleGuard implements CanActivate {
  private readonly store = new Map<string, ThrottleEntry>();
  private readonly MAX_REQUESTS = 5;
  private readonly WINDOW_MS = 60_000; // 1 minute
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up stale entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    // Only throttle auth routes
    if (!path.startsWith('/auth')) {
      return true;
    }

    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';

    const now = Date.now();
    const entry = this.store.get(ip);

    // First request or window expired — create/reset
    if (!entry || now > entry.resetAt) {
      this.store.set(ip, { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }

    // Increment count
    entry.count++;

    if (entry.count > this.MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw AppException.rateLimited(
        'Too many authentication attempts. Please try again later.',
        retryAfter,
      );
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
