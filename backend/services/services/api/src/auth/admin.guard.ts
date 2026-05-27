import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

export const IS_ADMIN_KEY = 'isAdmin';
export const RequireAdmin = () => SetMetadata(IS_ADMIN_KEY, true);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const adminEmails = (
      process.env.ADMIN_EMAILS ||
      'admin@edutu.ai,founder@edutu.ai,nwosupaul3@gmail.com,nwouspaul3@gmail.com'
    )
      .split(',')
      .map((e) => e.trim().toLowerCase());

    const userEmail = user.email?.toLowerCase();

    if (userEmail && adminEmails.includes(userEmail)) {
      return true;
    }

    const allowedRoles = new Set([
      'admin',
      'super_admin',
      'moderator',
      'support_agent',
    ]);

    if (allowedRoles.has(user.role)) {
      return true;
    }

    throw new ForbiddenException('Admin access required');
  }
}
