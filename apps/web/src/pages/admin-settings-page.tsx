import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
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
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PlatformBackup = {
  id: string;
  tier: string;
  trigger: string;
  status: string;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
  sizeBytes: number;
  errorMessage: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTier(tier: string): string {
  switch (tier) {
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'manual':
      return 'Manual';
    default:
      return tier;
  }
}

type AdminSettingsPageProps = {
  token: string;
  isGlobalAdmin: boolean;
};

export function AdminSettingsPage({ token, isGlobalAdmin }: AdminSettingsPageProps) {
  useDocumentTitle(buildPageTitle('Admin settings'));

  const [backups, setBackups] = useState<PlatformBackup[]>([]);
  const [maintenance, setMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [restoreTarget, setRestoreTarget] = useState<PlatformBackup | null>(null);
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(async () => {
    if (!isGlobalAdmin) return;
    setLoading(true);
    setError('');
    try {
      const res = await gqlRequest<{ platformBackups: PlatformBackup[]; platformMaintenanceMode: boolean }>(
        token,
        `query {
          platformBackups(limit:100) { id tier trigger status label createdAt completedAt sizeBytes errorMessage }
          platformMaintenanceMode
        }`,
      );
      setBackups(res.platformBackups);
      setMaintenance(res.platformMaintenanceMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load platform backups');
    } finally {
      setLoading(false);
    }
  }, [token, isGlobalAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tierFilter === 'all') return backups;
    return backups.filter((b) => b.tier === tierFilter);
  }, [backups, tierFilter]);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      await gqlRequest(token, `mutation { createPlatformBackup { id } }`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    setError('');
    try {
      await gqlRequest(
        token,
        `mutation($backupId:ID!, $confirmId:ID!){ restorePlatformBackup(backupId:$backupId, confirmId:$confirmId){ ok } }`,
        { backupId: restoreTarget.id, confirmId: confirmId.trim() },
      );
      setRestoreTarget(null);
      setConfirmId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(backupId: string) {
    setBusy(true);
    setError('');
    try {
      await gqlRequest(token, `mutation($backupId:ID!){ deletePlatformBackup(backupId:$backupId) }`, { backupId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  if (!isGlobalAdmin) {
    return (
      <div className="w-full">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Admin settings</CardTitle>
            <CardDescription>Platform administrator access required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Platform backups</CardTitle>
            <CardDescription>
              Full MongoDB + asset volume snapshots. Retention: hourly (24), daily (7), weekly (4). Restore affects{' '}
              <strong>all sites and users</strong>.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="all">All tiers</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual</option>
            </select>
            <Button type="button" onClick={() => void handleCreate()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create backup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {maintenance ? (
            <LoadErrorAlert message="Platform is in maintenance mode (restore may be in progress)." />
          ) : null}
          {error ? <LoadErrorAlert message={error} /> : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform backups yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(b.completedAt ?? b.createdAt).toLocaleString()}
                      {b.label ? <div className="text-xs text-muted-foreground">{b.label}</div> : null}
                    </TableCell>
                    <TableCell>{formatTier(b.tier)}</TableCell>
                    <TableCell>{b.status}</TableCell>
                    <TableCell>{formatBytes(b.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {b.status === 'completed' ? (
                          <Button type="button" size="icon-sm" variant="ghost" title="Restore" onClick={() => setRestoreTarget(b)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button type="button" size="icon-sm" variant="ghost" title="Delete" onClick={() => void handleDelete(b.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="text-xs text-muted-foreground">
            For belt-and-suspenders disaster recovery, also back up Docker volumes{' '}
            <code className="rounded bg-muted px-1">mongodb_data</code>, <code className="rounded bg-muted px-1">api_assets</code>, and{' '}
            <code className="rounded bg-muted px-1">api_backups</code> (see self-hosting docs).
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={restoreTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null);
            setConfirmId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore entire platform?</DialogTitle>
            <DialogDescription>
              This drops and restores the full database and asset files. All sites will be affected. Type the backup id
              below to confirm.
            </DialogDescription>
          </DialogHeader>
          {restoreTarget ? (
            <div className="space-y-2">
              <p className="font-mono text-sm break-all">{restoreTarget.id}</p>
              <Input
                placeholder="Paste backup id to confirm"
                value={confirmId}
                onChange={(e) => setConfirmId(e.target.value)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !restoreTarget || confirmId.trim() !== restoreTarget.id}
              onClick={() => void handleRestore()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restore platform
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
