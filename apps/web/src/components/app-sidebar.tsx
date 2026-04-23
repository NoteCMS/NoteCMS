import {
  ChevronUp,
  Home,
  Globe,
  Shapes,
  FileText,
  Users,
  Settings,
  LogOut,
  Image,
  KeyRound,
  Cog,
  UserCog,
  User,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from '@/components/ui/sidebar';
import type { Site } from '@/types/app';

const workspaceItems = [
  { path: '/dashboard', title: 'Dashboard', icon: Home },
  { path: '/content-types', title: 'Content Types', icon: Shapes },
  { path: '/entries', title: 'Entries', icon: FileText },
  { path: '/assets', title: 'Assets', icon: Image },
  { path: '/site-settings', title: 'Site settings', icon: Cog },
  { path: '/users', title: 'Users', icon: Users },
];

const adminItemsBase = [
  { path: '/admin/sites', title: 'Sites', icon: Globe },
  { path: '/admin/settings', title: 'Admin Settings', icon: Settings },
];

type AppSidebarProps = {
  userName: string;
  userEmail: string;
  sites: Site[];
  activeSiteId: string;
  onSiteChange: (siteId: string) => void;
  onLogout: () => void;
  activePath: string;
  onNavigate: (path: string) => void;
  contentTypeMenuItems?: Array<{ path: string; title: string }>;
  /** Site owner: show API keys under Admin */
  showSiteAdminTools?: boolean;
  /** Platform admin: show All users under Admin */
  showPlatformUsersNav?: boolean;
};

export function AppSidebar({
  userName,
  userEmail,
  sites,
  activeSiteId,
  onSiteChange,
  onLogout,
  activePath,
  onNavigate,
  contentTypeMenuItems = [],
  showSiteAdminTools = false,
  showPlatformUsersNav = false,
}: AppSidebarProps) {
  const activeSite = sites.find((site) => site.id === activeSiteId);

  const adminItems = [
    adminItemsBase[0],
    ...(showPlatformUsersNav ? [{ path: '/admin/users' as const, title: 'All users', icon: UserCog }] : []),
    ...(showSiteAdminTools ? [{ path: '/admin/api-keys' as const, title: 'API keys', icon: KeyRound }] : []),
    adminItemsBase[1],
  ];

  return (
    <Sidebar variant='floating'>
      <SidebarHeader>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Note CMS</span>
                <span className="truncate text-xs text-muted-foreground">{activeSite?.name ?? 'Select site'}</span>
              </div>
              <ChevronUp className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            {sites.map((site) => (
              <DropdownMenuItem key={site.id} onClick={() => onSiteChange(site.id)}>
                {site.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton isActive={activePath === item.path} onClick={() => onNavigate(item.path)}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {contentTypeMenuItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Site content</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {contentTypeMenuItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={activePath === item.path || activePath.startsWith(`${item.path}/`)}
                      onClick={() => onNavigate(item.path)}
                    >
                      <FileText />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={
                      activePath === item.path ||
                      (item.path === '/admin/users' && activePath.startsWith('/admin/users'))
                    }
                    onClick={() => onNavigate(item.path)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-(--radix-dropdown-menu-trigger-width)">
                <DropdownMenuItem onClick={() => onNavigate('/account')}>
                  <User />
                  Your account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
