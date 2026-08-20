import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService destructive authorization', () => {
  const createInvitation = jest.fn();
  const clerkClient = {
    invitations: { createInvitation },
  } as any;
  const auditService = { log: jest.fn() } as any;

  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAILS = 'owner@edutu.org';
    service = new AdminService(clerkClient, auditService);
  });

  afterAll(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it.each(['admin', 'moderator', 'support_agent'])(
    'does not allow %s to invite or assign platform users',
    async (role) => {
      const actor = {
        id: `actor-${role}`,
        email: `${role}@example.test`,
        role,
      };

      await expect(
        service.inviteUser(actor, {
          email: 'new-user@example.test',
          role: 'user',
          notify: false,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(createInvitation).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'moderator', 'support_agent'])(
    'does not allow %s to change another user role',
    async (role) => {
      const actor = {
        id: `actor-${role}`,
        email: `${role}@example.test`,
        role,
      };

      await expect(
        service.updateUserRole(actor, 'target-user', { role: 'admin' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(auditService.log).not.toHaveBeenCalled();
    },
  );
});
