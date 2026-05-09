// Mock hook to replace Firebase role management functionality
import { useEffect, useState } from 'react';

export type UserRole = 'user' | 'admin' | 'moderator' | 'premium';

interface UserRoles {
  [userId: string]: UserRole[];
}

// Mock user roles data
const mockUserRoles: UserRoles = {
  'default-user': ['user'],
  'admin-user': ['user', 'admin'],
  'moderator-user': ['user', 'moderator'],
};

export function useRoleManager() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getUserRoles = async (userId: string): Promise<UserRole[]> => {
    console.log('Getting user roles (using mock implementation)', userId);
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return mockUserRoles[userId] || ['user'];
  };

  const addUserRole = async (userId: string, role: UserRole): Promise<boolean> => {
    console.log('Adding user role (using mock implementation)', { userId, role });
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // In a real implementation, this would update the database
      if (!mockUserRoles[userId]) {
        mockUserRoles[userId] = [];
      }
      if (!mockUserRoles[userId].includes(role)) {
        mockUserRoles[userId].push(role);
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
    console.log('Removing user role (using mock implementation)', { userId, role });
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // In a real implementation, this would update the database
      if (mockUserRoles[userId]) {
        mockUserRoles[userId] = mockUserRoles[userId].filter(r => r !== role);
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