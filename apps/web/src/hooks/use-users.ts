import { useEffect, useState } from 'react';
import { gqlRequest } from '@/api/graphql';
import type { AccessDraft, GlobalUser, Role, Site, Status } from '@/types/app';

function buildAccessDraft(user: GlobalUser | null, sites: Site[]): AccessDraft {
  const draft: AccessDraft = {};
  for (const site of sites) {
    const existing = user?.access.find((entry) => entry.siteId === site.id);
    draft[site.id] = {
      enabled: Boolean(existing),
      role: existing?.role ?? 'viewer',
    };
  }
  return draft;
}

export function useUsers(token: string, sites: Site[], active: boolean, workspaceSiteId: string) {
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [siteFilter, setSiteFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [adminFilter, setAdminFilter] = useState<'all' | 'admin' | 'user'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserStatus, setNewUserStatus] = useState<Status>('active');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [managedUser, setManagedUser] = useState<GlobalUser | null>(null);
  const [accessDraft, setAccessDraft] = useState<AccessDraft>({});

  useEffect(() => {
    if (!workspaceSiteId) {
      setSiteFilter('all');
      return;
    }
    setSiteFilter(workspaceSiteId);
  }, [workspaceSiteId]);

  async function loadUsers() {
    if (!token) return;
    setIsUsersLoading(true);
    setUsersError('');
    try {
      const variables: Record<string, unknown> = {};
      if (roleFilter !== 'all') variables.role = roleFilter;
      if (siteFilter !== 'all') variables.siteId = siteFilter;
      if (statusFilter !== 'all') variables.status = statusFilter;
      if (adminFilter !== 'all') variables.isAdmin = adminFilter === 'admin';

      const data = await gqlRequest<{ globalUsers: GlobalUser[] }>(
        token,
        'query($role:String,$siteId:ID,$status:String,$isAdmin:Boolean){ globalUsers(role:$role,siteId:$siteId,status:$status,isAdmin:$isAdmin){ id email status isAdmin access { siteId siteName role } } }',
        variables,
      );
      setUsers(data.globalUsers);
    } catch (loadError) {
      setUsersError(loadError instanceof Error ? loadError.message : 'Failed to load users');
    } finally {
      setIsUsersLoading(false);
    }
  }

  useEffect(() => {
    if (token && active) {
      void loadUsers();
    }
  }, [token, active, roleFilter, siteFilter, statusFilter, adminFilter]);

  async function createUser() {
    setUsersError('');
    try {
      await gqlRequest(
        token,
        'mutation($email:String!,$password:String!,$status:String,$isAdmin:Boolean){ createGlobalUser(email:$email,password:$password,status:$status,isAdmin:$isAdmin){ id } }',
        { email: newUserEmail, password: newUserPassword, status: newUserStatus, isAdmin: newUserIsAdmin },
      );
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserStatus('active');
      setNewUserIsAdmin(false);
      setCreateOpen(false);
      await loadUsers();
    } catch (createError) {
      setUsersError(createError instanceof Error ? createError.message : 'Failed to create user');
    }
  }

  async function updateStatus(userId: string, status: Status) {
    setUsersError('');
    try {
      await gqlRequest(
        token,
        'mutation($userId:ID!,$status:String!){ updateUserStatus(userId:$userId,status:$status){ id } }',
        { userId, status },
      );
      await loadUsers();
    } catch (updateError) {
      setUsersError(updateError instanceof Error ? updateError.message : 'Failed to update status');
    }
  }

  async function updateAdmin(userId: string, isAdmin: boolean) {
    setUsersError('');
    try {
      await gqlRequest(
        token,
        'mutation($userId:ID!,$isAdmin:Boolean!){ setUserAdmin(userId:$userId,isAdmin:$isAdmin){ id } }',
        { userId, isAdmin },
      );
      await loadUsers();
    } catch (updateError) {
      setUsersError(updateError instanceof Error ? updateError.message : 'Failed to update admin status');
    }
  }

  function openManageAccess(user: GlobalUser) {
    setManagedUser(user);
    setAccessDraft(buildAccessDraft(user, sites));
    setManageOpen(true);
  }

  async function saveAccessChanges() {
    if (!managedUser) return;
    setUsersError('');
    try {
      const currentMap = new Map(managedUser.access.map((entry) => [entry.siteId, entry]));
      for (const site of sites) {
        const draft = accessDraft[site.id];
        const current = currentMap.get(site.id);
        if (!draft) continue;

        if (draft.enabled) {
          if (!current || current.role !== draft.role) {
            await gqlRequest(
              token,
              'mutation($userId:ID!,$siteId:ID!,$role:String!){ setUserSiteRole(userId:$userId,siteId:$siteId,role:$role){ id } }',
              { userId: managedUser.id, siteId: site.id, role: draft.role },
            );
          }
        } else if (current) {
          await gqlRequest(
            token,
            'mutation($userId:ID!,$siteId:ID!){ removeUserSiteAccess(userId:$userId,siteId:$siteId){ id } }',
            { userId: managedUser.id, siteId: site.id },
          );
        }
      }

      setManageOpen(false);
      await loadUsers();
    } catch (saveError) {
      setUsersError(saveError instanceof Error ? saveError.message : 'Failed to save access');
    }
  }

  return {
    users,
    isUsersLoading,
    usersError,
    roleFilter,
    setRoleFilter,
    siteFilter,
    setSiteFilter,
    statusFilter,
    setStatusFilter,
    adminFilter,
    setAdminFilter,
    createOpen,
    setCreateOpen,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    newUserStatus,
    setNewUserStatus,
    newUserIsAdmin,
    setNewUserIsAdmin,
    manageOpen,
    setManageOpen,
    managedUser,
    accessDraft,
    setAccessDraft,
    loadUsers,
    createUser,
    updateStatus,
    updateAdmin,
    openManageAccess,
    saveAccessChanges,
  };
}
