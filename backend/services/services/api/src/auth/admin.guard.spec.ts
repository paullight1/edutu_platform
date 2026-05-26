import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let reflector: Reflector;

  const createMockContext = (user?: any, isPublic = false) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { context, isPublic };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if route is public', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { context } = createMockContext(undefined, true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow access if user email is in admin list', () => {
    process.env.ADMIN_EMAILS = 'admin@edutu.org, test@edutu.org';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({ email: 'Admin@Edutu.com' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user role is admin', () => {
    process.env.ADMIN_EMAILS = '';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({ email: 'user@edutu.org', role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException for non-admin user', () => {
    process.env.ADMIN_EMAILS = 'admin@edutu.org';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({ email: 'user@edutu.org', role: 'user' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Admin access required');
  });
});
