import { UsersManagementView } from '@/components/users-management-view';
import type { Site } from '@/types/app';

type WorkspaceUsersPageProps = {
  token: string;
  sites: Site[];
  workspaceSiteId: string;
  isSiteOwner: boolean;
};

/** Workspace nav: members of the active site; site owners can create workspace-only accounts. */
export function WorkspaceUsersPage({ token, sites, workspaceSiteId, isSiteOwner }: WorkspaceUsersPageProps) {
  return (
    <UsersManagementView
      variant="workspace"
      token={token}
      sites={sites}
      workspaceSiteId={workspaceSiteId}
      isGlobalAdmin={false}
      isSiteOwner={isSiteOwner}
    />
  );
}

type PlatformUsersPageProps = {
  token: string;
  sites: Site[];
  workspaceSiteId: string;
};

/** Admin nav: platform-wide user directory (platform administrators only). */
export function PlatformUsersPage({ token, sites, workspaceSiteId }: PlatformUsersPageProps) {
  return (
    <UsersManagementView
      variant="platform"
      token={token}
      sites={sites}
      workspaceSiteId={workspaceSiteId}
      isGlobalAdmin
      isSiteOwner={false}
    />
  );
}
