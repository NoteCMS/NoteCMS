import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
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
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Site } from '@/types/app';

type ApiKeyRow = {
  id: string;
  siteId: string;
  name: string;
  keyHint: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ApiKeysPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  canManage: boolean;
};

export function ApiKeysPage({ token, workspaceSiteId, sites, canManage }: ApiKeysPageProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const activeSite = sites.find((site) => site.id === workspaceSiteId);

  const loadKeys = useCallback(async () => {
    if (!workspaceSiteId || !canManage) {
      setKeys([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await gqlRequest<{ apiKeys: ApiKeyRow[] }>(
        token,
        'query($siteId:ID!){ apiKeys(siteId:$siteId){ id siteId name keyHint createdAt lastUsedAt } }',
        { siteId: workspaceSiteId },
      );
      setKeys(response.apiKeys);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load API keys');
      setKeys([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceSiteId, canManage]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleCreate(event?: FormEvent) {
    event?.preventDefault();
    if (!canManage || !workspaceSiteId) return;
    setError('');
    setNewToken(null);
    setIsCreating(true);
    try {
      const response = await gqlRequest<{ createApiKey: { apiKey: ApiKeyRow; token: string } }>(
        token,
        'mutation($siteId:ID!,$name:String!){ createApiKey(siteId:$siteId,name:$name){ apiKey { id siteId name keyHint createdAt lastUsedAt } token } }',
        { siteId: workspaceSiteId, name: name.trim() || 'API key' },
      );
      setNewToken(response.createApiKey.token);
      setName('');
      setCreateDialogOpen(false);
      await loadKeys();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!canManage || !workspaceSiteId) return;
    if (!window.confirm('Revoke this key? Apps using it will stop working immediately.')) return;
    setError('');
    setRevokingId(id);
    try {
      await gqlRequest(token, 'mutation($id:ID!,$siteId:ID!){ revokeApiKey(id:$id,siteId:$siteId) }', {
        id,
        siteId: workspaceSiteId,
      });
      await loadKeys();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to revoke key');
    } finally {
      setRevokingId(null);
    }
  }

  async function copyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint('Copied.');
      window.setTimeout(() => setCopyHint(''), 2000);
    } catch {
      setCopyHint('Could not copy.');
    }
  }

  if (!canManage) {
    return (
      <div className="w-full space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>Headless access for your public site or apps.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Only workspace admins and owners can manage API keys.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Use keys from your frontend with{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code> or{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">x-api-key</code>. Keys can read{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">contentTypes</code>,{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">entries</code>, and{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">listAssets</code> for{' '}
              <span className="font-medium">{activeSite?.name ?? 'this site'}</span> only.
            </CardDescription>
          </div>
          <Button type="button" className="shrink-0" onClick={() => setCreateDialogOpen(true)}>
            Generate key
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) setName('');
            }}
          >
            <DialogContent className="sm:max-w-md">
              <form
                className="flex flex-col gap-6"
                onSubmit={(event) => {
                  void handleCreate(event);
                }}
              >
                <DialogHeader>
                  <DialogTitle>New API key</DialogTitle>
                  <DialogDescription>Give this key a name so you can recognize it later. The secret is only shown once after creation.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Field>
                    <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                    <FieldContent>
                      <Input
                        id="api-key-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Enter your key name"
                        autoComplete="off"
                        autoFocus
                      />
                    </FieldContent>
                  </Field>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? 'Generating…' : 'Generate'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {newToken ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Copy this key now — it will not be shown again.</p>
              <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-background/80 p-2 text-xs">{newToken}</pre>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => void copyToken(newToken)}>
                  Copy
                </Button>
                {copyHint ? <span className="text-xs text-muted-foreground">{copyHint}</span> : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => setNewToken(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Hint</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No active keys yet. Use <span className="font-medium text-foreground">Generate key</span> to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">…{key.keyHint}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(key.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={revokingId === key.id}
                          onClick={() => void handleRevoke(key.id)}
                        >
                          {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
