import { useMemo, useState } from 'react';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
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
import { useUsers } from '@/hooks/use-users';

type UsersPageProps = {
  token: string;
  sites: Site[];
  workspaceSiteId: string;
};

export function UsersPage({ token, sites, workspaceSiteId }: UsersPageProps) {
  const siteTitle = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() || 'Workspace';
  useDocumentTitle(buildPageTitle('Users & roles', siteTitle));

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
  } = useUsers(token, sites, true, workspaceSiteId);

  const columns = useMemo<ColumnDef<GlobalUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
      },
      {
        accessorKey: 'isAdmin',
        header: 'Type',
        cell: ({ row }) => (row.original.isAdmin ? <Badge>admin</Badge> : <Badge variant="secondary">user</Badge>),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.status === 'active' ? <Badge variant="secondary">active</Badge> : <Badge variant="outline">disabled</Badge>,
      },
      {
        id: 'siteAccess',
        header: 'Site Access',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {row.original.access.map((entry) => (
              <Badge key={`${row.original.id}-${entry.siteId}`} variant="secondary">
                {entry.siteName}:{entry.role}
              </Badge>
            ))}
            {!row.original.access.length ? <Badge variant="outline">No access</Badge> : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button variant="outline" onClick={() => openManageAccess(row.original)}>
              Manage
            </Button>
          </div>
        ),
      },
    ],
    [openManageAccess],
  );

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Global Users</CardTitle>
            <CardDescription>Filter users by site access and role.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Create User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Global User</DialogTitle>
                <DialogDescription>Create a user first, then assign site access.</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void createUser();
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
                  <Label>Account Type</Label>
                  <Combobox
                    value={newUserIsAdmin ? 'admin' : 'user'}
                    onValueChange={(value) => setNewUserIsAdmin(value === 'admin')}
                    placeholder="Account type"
                    searchPlaceholder="Search account type..."
                    options={[
                      { value: 'user', label: 'user' },
                      { value: 'admin', label: 'admin' },
                    ]}
                    className="w-full"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          {usersError ? <p className="text-sm text-destructive">{usersError}</p> : null}

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
                          { value: 'owner', label: 'owner' },
                          { value: 'admin', label: 'admin' },
                          { value: 'editor', label: 'editor' },
                          { value: 'viewer', label: 'viewer' },
                        ]}
                        className="w-full"
                      />
                    </div>

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
                      <Label className="text-xs text-muted-foreground">Account Type</Label>
                      <Combobox
                        value={adminFilter}
                        onValueChange={(value) => setAdminFilter(value as 'all' | 'admin' | 'user')}
                        placeholder="Account type"
                        searchPlaceholder="Search account type..."
                        options={[
                          { value: 'all', label: 'All types' },
                          { value: 'admin', label: 'admin' },
                          { value: 'user', label: 'user' },
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
            <DialogTitle>Manage Site Access</DialogTitle>
            <DialogDescription>{managedUser?.email ?? ''}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Account Type</Label>
                <Combobox
                  value={managedUser?.isAdmin ? 'admin' : 'user'}
                  onValueChange={(value) => {
                    if (!managedUser) return;
                    void updateAdmin(managedUser.id, value === 'admin');
                  }}
                  placeholder="Account type"
                  searchPlaceholder="Search account type..."
                  options={[
                    { value: 'user', label: 'user' },
                    { value: 'admin', label: 'admin' },
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

            <div className="space-y-3">
              <Label>Site Access</Label>
            {sites.map((site) => {
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
                    options={[
                      { value: 'owner', label: 'owner' },
                      { value: 'admin', label: 'admin' },
                      { value: 'editor', label: 'editor' },
                      { value: 'viewer', label: 'viewer' },
                    ]}
                    className="w-full"
                    disabled={!draft.enabled}
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
