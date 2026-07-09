import { useCallback, useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/api/graphql';
import type { AccessDraft, GlobalUser, Role, Site, Status } from '@/types/app';

export type UsersListMode = 'workspace' | 'platform';

function buildAccessDraft(user: GlobalUser | null, manageSites: Site[]): AccessDraft {
  const draft: AccessDraft = {};
  for (const site of manageSites) {
    const existing = user?.access.find((entry) => entry.siteId === site.id);
    draft[site.id] = {
      enabled: Boolean(existing),
      role: existing?.role ?? 'viewer',
    };
  }
  return draft;
}

export function useUsers(
  token: string,
  sites: Site[],
  active: boolean,
  workspaceSiteId: string,
  listMode: UsersListMode,
) {
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
  const [newSiteUserRole, setNewSiteUserRole] = useState<Exclude<Role, 'owner'>>('viewer');
  const [mailConfigured, setMailConfigured] = useState(false);
  const [createSuccessMessage, setCreateSuccessMessage] = useState('');

  const [manageOpen, setManageOpen] = useState(false);
  const [managedUser, setManagedUser] = useState<GlobalUser | null>(null);
  const [accessDraft, setAccessDraft] = useState<AccessDraft>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const manageSites = useMemo(
    () =>
      listMode === 'workspace' && workspaceSiteId
        ? sites.filter((s) => s.id === workspaceSiteId)
        : sites,
    [listMode, sites, workspaceSiteId],
  );

  useEffect(() => {
    if (!active) return;
    if (listMode === 'workspace') {
      if (!workspaceSiteId) {
        setSiteFilter('all');
        return;
      }
      setSiteFilter(workspaceSiteId);
    }
  }, [active, listMode, workspaceSiteId]);

  useEffect(() => {
    if (!active) return;
    void (async () => {
      try {
        const data = await gqlRequest<{ mailConfigStatus: { configured: boolean } }>(
          token,
          '{ mailConfigStatus { configured } }',
        );
        setMailConfigured(data.mailConfigStatus.configured);
      } catch {
        setMailConfigured(false);
      }
    })();
  }, [token, active]);

  const loadUsers = useCallback(async () => {
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
  }, [token, roleFilter, siteFilter, statusFilter, adminFilter]);

  useEffect(() => {
    if (token && active) {
      void loadUsers();
    }
  }, [token, active, loadUsers]);

  async function createUser() {
    setUsersError('');
    setCreateSuccessMessage('');
    try {
      const variables: Record<string, unknown> = {
        email: newUserEmail,
        status: newUserStatus,
        isAdmin: newUserIsAdmin,
      };
      if (newUserPassword.trim()) variables.password = newUserPassword;
      await gqlRequest(
        token,
        'mutation($email:String!,$password:String,$status:String,$isAdmin:Boolean){ createGlobalUser(email:$email,password:$password,status:$status,isAdmin:$isAdmin){ id } }',
        variables,
      );
      const invited = mailConfigured && !newUserPassword.trim();
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserStatus('active');
      setNewUserIsAdmin(false);
      setCreateOpen(false);
      setCreateSuccessMessage(invited ? `Invite sent to ${variables.email as string}.` : 'User created.');
      await loadUsers();
    } catch (createError) {
      setUsersError(createError instanceof Error ? createError.message : 'Failed to create user');
    }
  }

  async function createSiteOnlyUser() {
    if (!workspaceSiteId) return;
    setUsersError('');
    setCreateSuccessMessage('');
    try {
      const variables: Record<string, unknown> = {
        siteId: workspaceSiteId,
        email: newUserEmail,
        role: newSiteUserRole,
      };
      if (newUserPassword.trim()) variables.password = newUserPassword;
      await gqlRequest(
        token,
        'mutation($siteId:ID!,$email:String!,$password:String,$role:String!){ createSiteUser(siteId:$siteId,email:$email,password:$password,role:$role){ id } }',
        variables,
      );
      const invited = mailConfigured && !newUserPassword.trim();
      setNewUserEmail('');
      setNewUserPassword('');
      setNewSiteUserRole('viewer');
      setCreateOpen(false);
      setCreateSuccessMessage(invited ? `Invite sent to ${variables.email as string}.` : 'User created.');
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

  const openManageAccess = useCallback(
    (user: GlobalUser) => {
      setManagedUser(user);
      setAccessDraft(buildAccessDraft(user, manageSites));
      setDeleteConfirmEmail('');
      setDeleteOpen(false);
      setManageOpen(true);
    },
    [manageSites],
  );

  async function deleteUser() {
    if (!managedUser) return;
    setUsersError('');
    setIsDeletingUser(true);
    try {
      await gqlRequest(token, 'mutation($userId:ID!){ deleteGlobalUser(userId:$userId) }', {
        userId: managedUser.id,
      });
      setDeleteOpen(false);
      setManageOpen(false);
      setManagedUser(null);
      setDeleteConfirmEmail('');
      await loadUsers();
    } catch (deleteError) {
      setUsersError(deleteError instanceof Error ? deleteError.message : 'Failed to delete user');
    } finally {
      setIsDeletingUser(false);
    }
  }

  async function saveAccessChanges() {
    if (!managedUser) return;
    setUsersError('');
    try {
      const currentMap = new Map(managedUser.access.map((entry) => [entry.siteId, entry]));
      for (const site of manageSites) {
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
    newSiteUserRole,
    setNewSiteUserRole,
    manageOpen,
    setManageOpen,
    managedUser,
    accessDraft,
    setAccessDraft,
    deleteOpen,
    setDeleteOpen,
    deleteConfirmEmail,
    setDeleteConfirmEmail,
    isDeletingUser,
    loadUsers,
    createUser,
    createSiteOnlyUser,
    mailConfigured,
    createSuccessMessage,
    setCreateSuccessMessage,
    updateStatus,
    updateAdmin,
    openManageAccess,
    saveAccessChanges,
    deleteUser,
    manageSites,
  };
}
