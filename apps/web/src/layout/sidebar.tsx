import { NavLink } from 'react-router-dom';
import { Home, Globe, Shapes, FileText, Users, Settings } from 'lucide-react';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { cn } from '../lib/utils';

const links = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/admin/sites', label: 'Sites', icon: Globe },
  { to: '/content-types', label: 'Content Types', icon: Shapes },
  { to: '/entries', label: 'Entries', icon: FileText },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/admin/settings', label: 'Admin Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="sticky top-4 flex h-[calc(100vh-2rem)] w-72 flex-col rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="mb-6 rounded-md bg-[var(--primary)] px-4 py-3 text-center font-bold text-[var(--primary-foreground)]">Note CMS</div>

      <nav className="flex-1 space-y-1">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]',
                )
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>BG</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold">Bram Grammer</p>
            <p className="text-xs text-[var(--muted-foreground)]">owner@note.local</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
