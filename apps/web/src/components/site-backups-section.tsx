import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type SiteBackup = {
  id: string;
  tier: string;
  trigger: string;
  status: string;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
  sizeBytes: number;
  errorMessage: string | null;
  summary: { contentTypes: number; entries: number; assets: number; siteSettings: boolean };
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

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SiteBackupsSection({
  token,
  siteId,
  siteLabel,
  backupEnabled,
  onSettingsChanged,
}: {
  token: string;
  siteId: string;
  siteLabel: string;
  backupEnabled: boolean;
  onSettingsChanged?: () => Promise<void>;
}) {
  const [backups, setBackups] = useState<SiteBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [restoreTarget, setRestoreTarget] = useState<SiteBackup | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(backupEnabled);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await gqlRequest<{ siteBackups: SiteBackup[] }>(
        token,
        `query($siteId:ID!){ siteBackups(siteId:$siteId, limit:100){ id tier trigger status label createdAt completedAt sizeBytes errorMessage summary { contentTypes entries assets siteSettings } } }`,
        { siteId },
      );
      setBackups(res.siteBackups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, [token, siteId]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const filtered = useMemo(() => {
    if (tierFilter === 'all') return backups;
    return backups.filter((b) => b.tier === tierFilter);
  }, [backups, tierFilter]);

  async function handleCreateBackup() {
    setBusy(true);
    setError('');
    try {
      await gqlRequest(token, `mutation($siteId:ID!){ createSiteBackup(siteId:$siteId){ id } }`, { siteId });
      await loadBackups();
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
        `mutation($siteId:ID!, $backupId:ID!){ restoreSiteBackup(siteId:$siteId, backupId:$backupId){ preRestoreBackupId } }`,
        { siteId, backupId: restoreTarget.id },
      );
      setRestoreTarget(null);
      await loadBackups();
      await onSettingsChanged?.();
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
      await gqlRequest(token, `mutation($siteId:ID!, $backupId:ID!){ deleteSiteBackup(siteId:$siteId, backupId:$backupId) }`, {
        siteId,
        backupId,
      });
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(backupId: string) {
    setBusy(true);
    setError('');
    try {
      const res = await gqlRequest<{ exportSiteBackupJson: unknown }>(
        token,
        `query($siteId:ID!, $backupId:ID!){ exportSiteBackupJson(siteId:$siteId, backupId:$backupId) }`,
        { siteId, backupId },
      );
      downloadJson(`${siteLabel}-backup-${backupId}.json`, res.exportSiteBackupJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAuto(checked: boolean) {
    setAutoEnabled(checked);
    setError('');
    try {
      await gqlRequest(
        token,
        `mutation($siteId:ID!, $input:SiteBackupSettingsInput!){ updateSiteBackupSettings(siteId:$siteId, input:$input){ backupEnabled } }`,
        { siteId, input: { backupEnabled: checked } },
      );
      await onSettingsChanged?.();
    } catch (e) {
      setAutoEnabled(!checked);
      setError(e instanceof Error ? e.message : 'Could not update backup settings');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Backups
        </CardTitle>
        <CardDescription>
          Automatic snapshots: hourly (24 kept), daily (7 kept), weekly (4 kept). Restore replaces all site content with
          the selected snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <LoadErrorAlert message={error} /> : null}

        <Field orientation="horizontal">
          <Checkbox
            id="backup-enabled"
            checked={autoEnabled}
            onCheckedChange={(v) => void handleToggleAuto(v === true)}
            disabled={busy}
          />
          <FieldContent>
            <FieldLabel htmlFor="backup-enabled">Automatic backups enabled</FieldLabel>
            <FieldDescription>When off, scheduled hourly/daily/weekly snapshots are skipped for this site.</FieldDescription>
          </FieldContent>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void handleCreateBackup()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create backup now
          </Button>
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
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading backups…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet.</p>
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
                        <>
                          <Button type="button" size="icon-sm" variant="ghost" title="Restore" onClick={() => setRestoreTarget(b)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon-sm" variant="ghost" title="Download" onClick={() => void handleDownload(b.id)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
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
      </CardContent>

      <Dialog open={restoreTarget != null} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              This replaces all content types, entries, assets, and portable site settings for <strong>{siteLabel}</strong>.
              A pre-restore manual snapshot is created automatically first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleRestore()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
