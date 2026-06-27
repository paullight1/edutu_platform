import { describe, expect, it } from 'vitest';
import { isAdminAccessAllowed } from '../../lib/adminAccess';

describe('isAdminAccessAllowed', () => {
  it('allows controlled admin profile roles', () => {
    expect(isAdminAccessAllowed({ profileRole: 'admin' })).toBe(true);
    expect(isAdminAccessAllowed({ profileRole: 'super_admin' })).toBe(true);
  });

  it('allows configured admin emails case-insensitively', () => {
    expect(
      isAdminAccessAllowed({
        email: 'Founder@Edutu.org',
        allowedEmails: ['founder@edutu.org'],
      })
    ).toBe(true);
  });

  it('rejects regular users', () => {
    expect(
      isAdminAccessAllowed({
        email: 'student@example.com',
        profileRole: 'user',
        publicRole: 'user',
        allowedEmails: ['admin@edutu.org'],
      })
    ).toBe(false);
  });
});
