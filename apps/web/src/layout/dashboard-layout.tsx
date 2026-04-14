import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-[var(--background)] p-4">
      <div className="mx-auto flex max-w-7xl gap-6">
        <Sidebar />
        <main className="flex-1 py-2">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
