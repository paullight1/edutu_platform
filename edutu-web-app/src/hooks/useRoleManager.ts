import { useState } from 'react';

export type UserRole = 'user' | 'admin' | 'moderator' | 'premium';

interface UserRoles {
  [userId: string]: UserRole[];
}

const localUserRoles: UserRoles = {
  'default-user': ['user'],
  'admin-user': ['user', 'admin'],
  'moderator-user': ['user', 'moderator'],
};

export function useRoleManager() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getUserRoles = async (userId: string): Promise<UserRole[]> => {
    if (import.meta.env.DEV) {
      console.debug('Role manager is using local development roles', userId);
    }
    return localUserRoles[userId] || ['user'];
  };

  const addUserRole = async (userId: string, role: UserRole): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      if (!import.meta.env.DEV) {
        throw new Error('Role management is not connected to the backend yet.');
      }
      if (!localUserRoles[userId]) {
        localUserRoles[userId] = [];
      }
      if (!localUserRoles[userId].includes(role)) {
        localUserRoles[userId].push(role);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add role';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeUserRole = async (userId: string, role: UserRole): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      if (!import.meta.env.DEV) {
        throw new Error('Role management is not connected to the backend yet.');
      }
      if (localUserRoles[userId]) {
        localUserRoles[userId] = localUserRoles[userId].filter(r => r !== role);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove role';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    getUserRoles,
    addUserRole,
    removeUserRole,
    loading,
    error
  };
}

export default useRoleManager;
