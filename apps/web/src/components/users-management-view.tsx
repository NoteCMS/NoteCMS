import { useMemo, useState } from 'react';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { LoadErrorAlert } from '@/components/load-error-alert';
import type { ColumnDef } from '@tanstack/react-table';
import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataTable } from '@/components/data-table';
import type { GlobalUser, Role, Site, Status } from '@/types/app';
import { useUsers, type UsersListMode } from '@/hooks/use-users';

export type UsersManagementViewProps = {
  variant: UsersListMode;
  token: string;
  sites: Site[];
  workspaceSiteId: string;
  isGlobalAdmin: boolean;
  isSiteOwner: boolean;
};

export function UsersManagementView({
  variant,
  token,
  sites,
  workspaceSiteId,
  isGlobalAdmin,
  isSiteOwner,
}: UsersManagementViewProps) {
  const isWorkspace = variant === 'workspace';
  const isPlatform = variant === 'platform';
  const canManagePlatformFields = isPlatform && isGlobalAdmin;
  const canCreateSiteUser = isWorkspace && isSiteOwner;
  const canCreateGlobalUser = isPlatform && isGlobalAdmin;
  const canCreateUser = canCreateSiteUser || canCreateGlobalUser;

  const workspaceSiteName = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() ?? 'this site';
  const siteTitle = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() || 'Workspace';
  const docTitle = isWorkspace ? buildPageTitle('Users', siteTitle) : buildPageTitle('All users', 'Admin');
  useDocumentTitle(docTitle);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
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
    loadUsers,
    createUser,
    createSiteOnlyUser,
    updateStatus,
    updateAdmin,
    openManageAccess,
    saveAccessChanges,
    manageSites,
  } = useUsers(token, sites, true, workspaceSiteId, variant);

  const columns = useMemo<ColumnDef<GlobalUser>[]>(() => {
    const emailCol: ColumnDef<GlobalUser> = {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
    };
    const typeCol: ColumnDef<GlobalUser> = {
      accessorKey: 'isAdmin',
      header: 'Type',
      cell: ({ row }) =>
        row.original.isAdmin ? (
          <Badge>Platform admin</Badge>
        ) : (
          <Badge variant="secondary">Member</Badge>
        ),
    };
    const statusCol: ColumnDef<GlobalUser> = {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.status === 'active' ? (
          <Badge variant="secondary">active</Badge>
        ) : (
          <Badge variant="outline">disabled</Badge>
        ),
    };
    const siteAccessCol: ColumnDef<GlobalUser> = {
      id: 'siteAccess',
      header: isWorkspace ? 'Role on this site' : 'Site access',
      cell: ({ row }) => {
        if (isWorkspace) {
          const rowSite = row.original.access.find((a) => a.siteId === workspaceSiteId);
          return rowSite ? (
            <Badge variant="secondary">{rowSite.role}</Badge>
          ) : (
            <Badge variant="outline">No access</Badge>
          );
        }
        return (
          <div className="flex flex-wrap gap-2">
            {row.original.access.map((entry) => (
              <Badge key={`${row.original.id}-${entry.siteId}`} variant="secondary">
                {entry.siteName}:{entry.role}
              </Badge>
            ))}
            {!row.original.access.length ? <Badge variant="outline">No access</Badge> : null}
          </div>
        );
      },
    };
    const actionsCol: ColumnDef<GlobalUser> = {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="text-right">
          <Button variant="outline" onClick={() => openManageAccess(row.original)}>
            Manage
          </Button>
        </div>
      ),
    };
    return isPlatform
      ? [emailCol, typeCol, statusCol, siteAccessCol, actionsCol]
      : [emailCol, siteAccessCol, actionsCol];
  }, [isPlatform, isWorkspace, openManageAccess, workspaceSiteId]);

  function roleOptionsForSiteRow(draftRole: Role): { value: Role; label: string }[] {
    if (canManagePlatformFields) {
      return [
        { value: 'owner', label: 'Site owner' },
        { value: 'editor', label: 'Editor' },
        { value: 'viewer', label: 'Viewer' },
      ];
    }
    if (draftRole === 'owner') {
      return [{ value: 'owner', label: 'Site owner' }];
    }
    return [
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Viewer' },
    ];
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{isWorkspace ? 'Users' : 'All users'}</CardTitle>
            <CardDescription>
              {isWorkspace
                ? `Who can use ${workspaceSiteName}.`
                : "Accounts, which workspaces they're in, and who has full admin access."}
              {isWorkspace && isSiteOwner
                ? ' You can invite people and choose whether they can edit or only look around.'
                : null}
              {isWorkspace && !isSiteOwner ? ' Only an owner can invite someone new.' : null}
            </CardDescription>
          </div>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (open && canCreateSiteUser) setNewSiteUserRole('viewer');
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={!canCreateUser}>Create user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{canCreateGlobalUser ? 'Create user' : 'Add user to workspace'}</DialogTitle>
                <DialogDescription>
                  {canCreateGlobalUser
                    ? 'Create an account. Assign workspaces from the table or when you open Manage.'
                    : `New account will only access ${workspaceSiteName} as a viewer or editor.`}
                </DialogDescription>
              </DialogHeader>
              {usersError && createOpen ? (
                <LoadErrorAlert compact title={null} message={usersError} onRetry={() => void loadUsers()} />
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canCreateGlobalUser) void createUser();
                  else void createSiteOnlyUser();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-user-password">Password</Label>
                  <Input
                    id="new-user-password"
                    type="password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    required
                  />
                </div>
                {canCreateGlobalUser ? (
                  <>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Combobox
                        value={newUserStatus}
                        onValueChange={(value) => setNewUserStatus(value as Status)}
                        placeholder="Status"
                        searchPlaceholder="Search status..."
                        options={[
                          { value: 'active', label: 'active' },
                          { value: 'disabled', label: 'disabled' },
                        ]}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Platform access</Label>
                      <Combobox
                        value={newUserIsAdmin ? 'platform_admin' : 'member'}
                        onValueChange={(value) => setNewUserIsAdmin(value === 'platform_admin')}
                        placeholder="Account type"
                        searchPlaceholder="Search account type..."
                        options={[
                          { value: 'member', label: 'Member (workspace access only)' },
                          { value: 'platform_admin', label: 'Platform administrator' },
                        ]}
                        className="w-full"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label>Role on this site</Label>
                    <Combobox
                      value={newSiteUserRole}
                      onValueChange={(value) => setNewSiteUserRole(value as Exclude<Role, 'owner'>)}
                      placeholder="Role"
                      searchPlaceholder="Search role..."
                      options={[
                        { value: 'viewer', label: 'Viewer' },
                        { value: 'editor', label: 'Editor' },
                      ]}
                      className="w-full"
                    />
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          {usersError && !createOpen && !manageOpen ? (
            <LoadErrorAlert title="Users" message={usersError} onRetry={() => void loadUsers()} />
          ) : null}

          <DataTable
            columns={columns}
            data={users}
            isLoading={isUsersLoading}
            filterColumnId="email"
            filterPlaceholder="Filter emails..."
            headerContent={
              <>
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Filters
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <Combobox
                        value={roleFilter}
                        onValueChange={(value) => setRoleFilter(value as 'all' | Role)}
                        placeholder="Role"
                        searchPlaceholder="Search role..."
                        options={[
                          { value: 'all', label: 'All roles' },
                          { value: 'owner', label: 'Site owner' },
                          { value: 'editor', label: 'Editor' },
                          { value: 'viewer', label: 'Viewer' },
                        ]}
                        className="w-full"
                      />
                    </div>

                    {isPlatform ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Site</Label>
                          <Combobox
                            value={siteFilter}
                            onValueChange={setSiteFilter}
                            placeholder="Site"
                            searchPlaceholder="Search site..."
                            options={[
                              { value: 'all', label: 'All sites' },
                              ...sites.map((site) => ({ value: site.id, label: site.name })),
                            ]}
                            className="w-full"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Platform access</Label>
                          <Combobox
                            value={adminFilter}
                            onValueChange={(value) => setAdminFilter(value as 'all' | 'admin' | 'user')}
                            placeholder="Account type"
                            searchPlaceholder="Search..."
                            options={[
                              { value: 'all', label: 'All types' },
                              { value: 'admin', label: 'Platform admin' },
                              { value: 'user', label: 'Member' },
                            ]}
                            className="w-full"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Combobox
                            value={statusFilter}
                            onValueChange={(value) => setStatusFilter(value as 'all' | Status)}
                            placeholder="Status"
                            searchPlaceholder="Search status..."
                            options={[
                              { value: 'all', label: 'All status' },
                              { value: 'active', label: 'active' },
                              { value: 'disabled', label: 'disabled' },
                            ]}
                            className="w-full"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Showing members for <span className="font-medium text-foreground">{workspaceSiteName}</span>.
                      </p>
                    )}
                  </PopoverContent>
                </Popover>

                <Button variant="outline" onClick={() => void loadUsers()} disabled={isUsersLoading}>
                  Refresh
                </Button>
              </>
            }
            emptyMessage="No users found for current filters."
          />
        </CardContent>
      </Card>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isWorkspace ? 'Workspace access' : 'Manage site access'}</DialogTitle>
            <DialogDescription>{managedUser?.email ?? ''}</DialogDescription>
          </DialogHeader>
          {usersError && manageOpen ? (
            <LoadErrorAlert compact title={null} message={usersError} onRetry={() => void loadUsers()} />
          ) : null}

          <div className="space-y-4">
            {!canManagePlatformFields ? (
              <p className="text-sm text-muted-foreground">
                Platform administrator and account status can only be changed on the All users page. You can edit site
                roles below; assigning or removing the site owner role is restricted to platform administrators.
              </p>
            ) : null}
            {canManagePlatformFields ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Platform access</Label>
                  <Combobox
                    value={managedUser?.isAdmin ? 'platform_admin' : 'member'}
                    onValueChange={(value) => {
                      if (!managedUser) return;
                      void updateAdmin(managedUser.id, value === 'platform_admin');
                    }}
                    placeholder="Account type"
                    searchPlaceholder="Search account type..."
                    options={[
                      { value: 'member', label: 'Member' },
                      { value: 'platform_admin', label: 'Platform administrator' },
                    ]}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Combobox
                    value={managedUser?.status ?? 'active'}
                    onValueChange={(value) => {
                      if (!managedUser) return;
                      void updateStatus(managedUser.id, value as Status);
                    }}
                    placeholder="Status"
                    searchPlaceholder="Search status..."
                    options={[
                      { value: 'active', label: 'active' },
                      { value: 'disabled', label: 'disabled' },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <Label>{isWorkspace ? workspaceSiteName : 'Site access'}</Label>
              {manageSites.map((site) => {
                const draft = accessDraft[site.id] ?? { enabled: false, role: 'viewer' as Role };
                return (
                  <div key={site.id} className="grid grid-cols-[1fr_140px] items-center gap-3">
                    <Button
                      type="button"
                      variant={draft.enabled ? 'default' : 'outline'}
                      className="justify-start"
                      onClick={() =>
                        setAccessDraft((prev) => ({
                          ...prev,
                          [site.id]: { ...draft, enabled: !draft.enabled },
                        }))
                      }
                    >
                      {site.name}
                    </Button>
                    <Combobox
                      value={draft.role}
                      onValueChange={(value) =>
                        setAccessDraft((prev) => ({
                          ...prev,
                          [site.id]: { ...draft, role: value as Role },
                        }))
                      }
                      placeholder="Role"
                      searchPlaceholder="Search role..."
                      options={roleOptionsForSiteRow(draft.role)}
                      className="w-full"
                      disabled={!draft.enabled || (!canManagePlatformFields && draft.role === 'owner')}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => void saveAccessChanges()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
