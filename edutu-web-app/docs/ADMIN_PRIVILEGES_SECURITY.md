# Admin Privileges & Security Model Documentation

## Overview
This document outlines the role-based access control (RBAC) system, security model, and privilege management for the Edutu platform's admin panel.

---

## Current Implementation

### Existing Admin Check
```typescript
// apps/admin/src/hooks/useAdminCheck.ts (exists)

export const useAdminCheck = () => {
  // Current implementation checks for any admin role
  // Simple binary: isAdmin or not
  const { user } = useUser();
  
  const isAdmin = user?.publicMetadata?.role === 'admin' ||
                  user?.publicMetadata?.role === 'super_admin';
  
  return { isAdmin, loading: !isLoaded, user };
};
```

### Current Status
| Feature | Status | Notes |
|---------|--------|-------|
| Basic Admin Check | ✅ Implemented | Binary yes/no |
| Login Page | ✅ Implemented | /login route |
| Admin Layout | ✅ Implemented | Protected layout |
| Sidebar Navigation | ✅ Implemented | With permissions |

---

## Missing Security Features

### 1. Role-Based Access Control (RBAC)
```
MISSING: Granular Permissions
- Multiple admin roles
- Permission matrix
- Feature-based access
- Audit logging
```

### 2. User Role Management
```
MISSING: Role CRUD
- Create roles
- Edit roles
- Assign roles to users
- View role assignments
```

### 3. API Security
```
MISSING: Endpoint Protection
- Role-based route guards
- Permission decorators
- API rate limiting
- Request validation
```

---

## Role Hierarchy

### Role Definitions

```
┌─────────────────┐
│   SUPER_ADMIN   │ ← Full system access, can manage all roles
├─────────────────┤
│   ADMIN         │ ← Full content and user management
├─────────────────┤
│   CONTENT_ADMIN │ ← Opportunities, Community, Announcements
├─────────────────┤
│   USER_ADMIN    │ ← User management, Roles
├─────────────────┤
│   ANALYTICS     │ ← Read-only analytics
├─────────────────┤
│   SUPPORT       │ ← Help center, Tickets only
├─────────────────┤
│   FINANCE       │ ← Financial operations only
└─────────────────┘
```

### Permission Matrix

| Permission | Super Admin | Admin | Content | User | Analytics | Support | Finance |
|------------|-------------|-------|---------|------|-----------|---------|---------|
| **Opportunities** |
| View All | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Feature | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Users** |
| View All | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Create | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Assign Roles | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Community** |
| View Posts | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Moderate | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Analytics** |
| View Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Export Reports | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Support** |
| View Tickets | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Respond | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Finance** |
| View Transactions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Process Refunds | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **System** |
| Manage Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| System Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Implementation Required

### 1. Database Schema

```sql
-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default roles
INSERT INTO roles (name, description, permissions, is_system) VALUES
('super_admin', 'Full system access', 
 '["*"]', true),
('admin', 'Full content and user management',
 '["opportunities.*", "users.*", "community.*", "analytics.*", "announcements.*"]', true),
('content_admin', 'Content management',
 '["opportunities.*", "community.*", "announcements.*"]', true),
('user_admin', 'User management',
 '["users.*"]', true),
('analytics', 'Read-only analytics',
 '["analytics.read"]', true),
('support', 'Support tickets',
 '["tickets.*"]', true),
('finance', 'Financial operations',
 '["finance.*"]', true);

-- User roles junction table
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- Audit log table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for audit logs
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

### 2. Role Management Service

```typescript
// services/roles.ts (NEW)

import { db } from './db';
import { roles, userRoles, auditLogs } from './schema';

export type Permission = 
  | 'opportunities.read' | 'opportunities.create' | 'opportunities.update' | 'opportunities.delete' | 'opportunities.feature'
  | 'users.read' | 'users.create' | 'users.update' | 'users.delete' | 'users.roles'
  | 'community.read' | 'community.moderate'
  | 'analytics.read' | 'analytics.export'
  | 'tickets.read' | 'tickets.respond'
  | 'finance.read' | 'finance.process'
  | 'roles.manage' | 'system.settings' | 'audit.read';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
}

export const roleService = {
  // Get all roles
  async getAll(): Promise<Role[]> {
    return db.select().from(roles);
  },

  // Get role by ID
  async getById(id: string): Promise<Role | null> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || null;
  },

  // Create role
  async create(data: Partial<Role>): Promise<Role> {
    const [role] = await db.insert(roles).values({
      name: data.name,
      description: data.description,
      permissions: data.permissions || [],
      isSystem: false,
    }).returning();
    return role;
  },

  // Update role
  async update(id: string, data: Partial<Role>): Promise<Role> {
    const [role] = await db.update(roles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return role;
  },

  // Delete role
  async delete(id: string): Promise<void> {
    const role = await this.getById(id);
    if (role?.isSystem) {
      throw new Error('Cannot delete system role');
    }
    await db.delete(roles).where(eq(roles.id, id));
  },

  // Assign role to user
  async assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
    await db.insert(userRoles).values({
      userId,
      roleId,
      assignedBy,
    });
    
    // Log the action
    await this.logAction(assignedBy, 'assign_role', 'user_role', undefined, {
      targetUser: userId,
      roleId,
    });
  },

  // Remove role from user
  async removeRole(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  },

  // Get user roles
  async getUserRoles(userId: string): Promise<Role[]> {
    const userRoleRecords = await db.select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    
    const roleIds = userRoleRecords.map(r => r.roleId);
    return db.select().from(roles).where(inArray(roles.id, roleIds));
  },

  // Check permission
  async hasPermission(userId: string, permission: Permission): Promise<boolean> {
    const userRolesList = await this.getUserRoles(userId);
    
    for (const role of userRolesList) {
      const perms = role.permissions as unknown as Permission[];
      if (perms.includes('*') || perms.includes(permission)) {
        return true;
      }
      // Check wildcard permissions
      const permPrefix = permission.split('.')[0];
      if (perms.includes(`${permPrefix}.*`)) {
        return true;
      }
    }
    return false;
  },

  // Log action
  async logAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    changes?: any
  ): Promise<void> {
    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      changes,
      ipAddress: getClientIP(), // Implement this
      userAgent: getClientUserAgent(), // Implement this
    });
  },
};
```

### 3. Authentication Hook with Permissions

```typescript
// hooks/usePermissions.ts (NEW)

import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { roleService, Permission } from '../services/roles';

export const usePermissions = () => {
  const { user } = useUser();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        // First check Clerk metadata for quick check
        const clerkRole = user.publicMetadata?.role as string;
        
        if (clerkRole === 'super_admin') {
          setPermissions(['*'] as any);
          setLoading(false);
          return;
        }

        // Then fetch from database for granular permissions
        const roles = await roleService.getUserRoles(user.id);
        const perms = roles.flatMap(r => r.permissions);
        setPermissions(perms);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  const hasPermission = (permission: Permission): boolean => {
    if (loading) return false;
    if (permissions.includes('*' as any)) return true;
    if (permissions.includes(permission)) return true;
    
    // Check wildcard
    const prefix = permission.split('.')[0];
    return permissions.includes(`${prefix}.*` as any);
  };

  const hasAnyPermission = (...perms: Permission[]): boolean => {
    return perms.some(p => hasPermission(p));
  };

  const hasAllPermissions = (...perms: Permission[]): boolean => {
    return perms.every(p => hasPermission(p));
  };

  return { permissions, hasPermission, hasAnyPermission, hasAllPermissions, loading };
};
```

### 4. Protected Route Component

```typescript
// components/admin/ProtectedRoute.tsx (NEW)

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, Permission } from '../../hooks/usePermissions';
import { LoadingFallback } from '../ui/LoadingFallback';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permission,
  permissions = [],
  requireAll = false,
  fallback,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) {
    return <LoadingFallback message="Checking permissions..." />;
  }

  let allowed = true;

  if (permission) {
    allowed = hasPermission(permission);
  }

  if (permissions.length > 0) {
    allowed = requireAll 
      ? hasAllPermissions(...permissions)
      : hasAnyPermission(...permissions);
  }

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

### 5. Role Management UI

```typescript
// components/admin/users/RoleManager.tsx (NEW)

import React, { useState, useEffect } from 'react';
import { roleService, Role, Permission } from '../../../services/roles';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Dialog } from '../../ui/Dialog';
import { Checkbox } from '../../ui/Checkbox';

const ALL_PERMISSIONS: Permission[] = [
  'opportunities.read', 'opportunities.create', 'opportunities.update', 
  'opportunities.delete', 'opportunities.feature',
  'users.read', 'users.create', 'users.update', 'users.delete', 'users.roles',
  'community.read', 'community.moderate',
  'analytics.read', 'analytics.export',
  'tickets.read', 'tickets.respond',
  'finance.read', 'finance.process',
  'roles.manage', 'system.settings', 'audit.read',
];

export const RoleManager: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<Permission[]>([]);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    const data = await roleService.getAll();
    setRoles(data);
  };

  const handleCreateRole = async () => {
    await roleService.create({
      name: newRoleName,
      permissions: newRolePermissions,
    });
    setIsCreateOpen(false);
    loadRoles();
  };

  const handleUpdateRole = async () => {
    if (!selectedRole) return;
    await roleService.update(selectedRole.id, {
      name: selectedRole.name,
      permissions: selectedRole.permissions,
    });
    loadRoles();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Role Management</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Create Role</Button>
      </div>

      {/* Role List */}
      <div className="grid gap-4">
        {roles.map(role => (
          <div 
            key={role.id}
            className="p-4 border rounded-lg cursor-pointer hover:border-brand-500"
            onClick={() => setSelectedRole(role)}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold">{role.name}</h3>
                <p className="text-sm text-gray-500">{role.description}</p>
              </div>
              {role.isSystem && (
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">System</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {role.permissions.slice(0, 5).map(p => (
                <span key={p} className="text-xs bg-brand-100 px-2 py-0.5 rounded">
                  {p}
                </span>
              ))}
              {role.permissions.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{role.permissions.length - 5} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Role Dialog */}
      <Dialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <h2 className="text-xl font-bold mb-4">Create New Role</h2>
        <Input
          label="Role Name"
          value={newRoleName}
          onChange={setNewRoleName}
          placeholder="e.g., content_moderator"
        />
        <div className="mt-4">
          <h3 className="font-bold mb-2">Permissions</h3>
          <div className="grid grid-cols-2 gap-2">
            {ALL_PERMISSIONS.map(perm => (
              <Checkbox
                key={perm}
                label={perm}
                checked={newRolePermissions.includes(perm)}
                onChange={checked => {
                  if (checked) {
                    setNewRolePermissions([...newRolePermissions, perm]);
                  } else {
                    setNewRolePermissions(newRolePermissions.filter(p => p !== perm));
                  }
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleCreateRole}>Create</Button>
          <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>

      {/* Edit Role Dialog */}
      {selectedRole && (
        <Dialog open={!!selectedRole} onClose={() => setSelectedRole(null)}>
          <h2 className="text-xl font-bold mb-4">Edit Role: {selectedRole.name}</h2>
          {/* Edit form similar to create */}
        </Dialog>
      )}
    </div>
  );
};
```

### 6. Audit Log Viewer

```typescript
// components/admin/system/AuditLogs.tsx (NEW)

import React, { useState, useEffect } from 'react';
import { db } from '../../../services/db';
import { auditLogs, users } from '../../../services/schema';
import { Table } from '../../ui/Table';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    resourceType: '',
  });

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadLogs = async () => {
    // Build query based on filters
    // For now, just fetch recent
    const data = await db.select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    setLogs(data);
    setLoading(false);
  };

  const columns = [
    { key: 'createdAt', header: 'Timestamp' },
    { key: 'userId', header: 'User' },
    { key: 'action', header: 'Action' },
    { key: 'resourceType', header: 'Resource' },
    { key: 'resourceId', header: 'Resource ID' },
    { key: 'ipAddress', header: 'IP Address' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Filter by user..."
          value={filters.userId}
          onChange={userId => setFilters({ ...filters, userId })}
        />
        <Input
          placeholder="Filter by action..."
          value={filters.action}
          onChange={action => setFilters({ ...filters, action })}
        />
        <Input
          placeholder="Filter by resource..."
          value={filters.resourceType}
          onChange={resourceType => setFilters({ ...filters, resourceType })}
        />
      </div>

      {/* Logs Table */}
      <Table data={logs} columns={columns} loading={loading} />
    </div>
  );
};
```

---

## API Route Protection

### Middleware Implementation

```typescript
// middleware/auth.ts (UPDATE)

import { NextFunction, Request, Response } from 'express';
import { roleService } from '../services/roles';

export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id; // From auth middleware
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await roleService.hasPermission(userId, permission as any);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: `Missing required permission: ${permission}`
        });
      }
    }

    next();
  };
};

// Usage in routes
app.post('/api/opportunities', 
  requireAuth,
  requirePermission('opportunities.create'),
  createOpportunity
);

app.delete('/api/opportunities/:id',
  requireAuth,
  requirePermission('opportunities.delete'),
  deleteOpportunity
);

app.put('/api/users/:id/role',
  requireAuth,
  requirePermission('users.roles'),
  assignUserRole
);
```

---

## Integration Points

### 1. Clerk Metadata Sync
```typescript
// When role changes, sync to Clerk
await clerkClient.users.updateUserMetadata(userId, {
  publicMetadata: {
    role: userRole.name,
    permissions: userRole.permissions,
  }
});
```

### 2. Route Guards
```typescript
// In AdminRoot.tsx
<Route 
  path="users" 
  element={
    <ProtectedRoute permission="users.read">
      <UsersPage />
    </ProtectedRoute>
  } 
/>
```

### 3. Component-Level Protection
```typescript
// In any component
const { hasPermission } = usePermissions();

{hasPermission('opportunities.delete') && (
  <Button onClick={handleDelete}>Delete</Button>
)}
```

---

## Testing Requirements

### Unit Tests
- [ ] Role creation
- [ ] Permission checking
- [ ] Wildcard permission matching
- [ ] Audit logging

### Integration Tests
- [ ] API route protection
- [ ] UI element visibility based on role
- [ ] Role assignment flow
- [ ] Audit log creation

### E2E Tests
- [ ] Super admin has full access
- [ ] Content admin cannot access user management
- [ ] Analytics user sees read-only view
- [ ] Support user only sees tickets

---

## Files to Create

```
apps/admin/src/
├── services/
│   └── roles.ts                 # NEW - Role service
├── hooks/
│   ├── usePermissions.ts       # NEW - Permission hook
│   └── useAuditLog.ts          # NEW - Audit log hook
├── components/
│   ├── admin/
│   │   ├── users/
│   │   │   ├── RoleManager.tsx        # NEW
│   │   │   ├── PermissionMatrix.tsx   # NEW
│   │   │   └── RoleAssignment.tsx     # NEW
│   │   └── system/
│   │       ├── AuditLogs.tsx          # NEW
│   │       └── AuditLogDetail.tsx     # NEW
│   └── ui/
│       └── Checkbox.tsx               # NEW (may already exist)
├── middleware/
│   └── auth.ts                # UPDATE - Add permission middleware
└── pages/
    └── admin/
        └── roles/
            └── index.tsx      # NEW - Roles management page
```

---

## Security Considerations

### 1. Rate Limiting
- Implement rate limiting per role
- Higher limits for higher roles
- Log excessive requests

### 2. IP Allowlisting
- Allow specific IPs for admin access
- Configurable per role

### 3. Session Management
- Shorter sessions for admin
- Re-auth for sensitive actions

### 4. Data Access
- Row-level security in database
- Query sanitization
- Input validation

### 5. Audit Trail
- Log all admin actions
- Immutable audit logs
- Regular review process

---

*Last Updated: 2026-04-07*
*Document Version: 1.0*