import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ClerkClient } from '@clerk/clerk-sdk-node';
import { verifyToken } from '@clerk/clerk-sdk-node';
import { IS_PUBLIC_KEY } from './public.decorator';
import { db } from '../db';
import { profiles } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject('ClerkClient') private clerkClient: ClerkClient,
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
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, payload.sub))
        .execute();

      request.user = {
        id: payload.sub,
        email: payload.email || profile?.email,
        firstName: payload.first_name || profile?.fullName?.split(' ')[0],
        lastName: payload.last_name,
        role: profile?.role || 'user',
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
