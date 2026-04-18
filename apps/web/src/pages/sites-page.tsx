import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Cog, Ellipsis, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { gqlRequest } from '@/api/graphql';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Site } from '@/types/app';

type SitesPageProps = {
  token: string;
  sites: Site[];
  isAdmin: boolean;
  onSitesChanged: () => Promise<void>;
};

export function SitesPage({ token, sites, isAdmin, onSitesChanged }: SitesPageProps) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goToSiteSettings = useCallback(
    (siteId: string) => {
      navigate(`/site-settings?site=${encodeURIComponent(siteId)}`);
    },
    [navigate],
  );

  async function handleCreateSite(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setError('');
    setIsSubmitting(true);
    try {
      const res = await gqlRequest<{ createSite: { id: string } }>(
        token,
        'mutation($name:String!,$url:String!){ createSite(name:$name,url:$url){ id } }',
        { name: name.trim(), url: url.trim() },
      );
      const newId = res.createSite.id;
      setName('');
      setUrl('');
      setCreateOpen(false);
      await onSitesChanged();
      goToSiteSettings(newId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create site');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDialogOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setError('');
      setName('');
      setUrl('');
    }
  }

  const columns = useMemo<ColumnDef<Site>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'url',
        header: 'Site URL',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.url}</span>
        ),
      },
      {
        id: 'role',
        header: 'Your role',
        cell: ({ row }) =>
          row.original.role ? (
            <Badge variant="secondary" className="font-normal capitalize">
              {row.original.role}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        meta: { compact: true },
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`More options for ${row.original.name}`}
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => goToSiteSettings(row.original.id)}>
                  <Cog className="size-4" />
                  Site settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [goToSiteSettings],
  );

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Sites</CardTitle>
            <CardDescription>
              Manage your workspaces and site settings.
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              New site
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin ? (
            <p className="text-sm text-muted-foreground">Admin access required to create sites.</p>
          ) : null}

          <DataTable
            columns={columns}
            data={sites}
            isLoading={false}
            filterColumnId="name"
            filterPlaceholder="Filter by name…"
            emptyMessage="No sites available."
            showColumnToggle={false}
            onRowClick={(site) => goToSiteSettings(site.id)}
            rowClickIgnoreColumnIds={['actions']}
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSite}>
            <DialogHeader>
              <DialogTitle>Create site</DialogTitle>
              <DialogDescription>Create a new workspace.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="dialog-site-name">Site name</Label>
                <Input
                  id="dialog-site-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="My project"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-site-url">Site URL</Label>
                <Input
                  id="dialog-site-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="example.com"
                  required
                  autoComplete="off"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" aria-live="polite">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => handleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create site'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
