import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Site } from '@/types/app';

/** Mirrors server `API_KEY_SCOPES` for admin UI. */
const KEY_SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'content_types:read', label: 'Content types · read' },
  { value: 'content_types:write', label: 'Content types · write' },
  { value: 'entries:read', label: 'Entries · read' },
  { value: 'entries:write', label: 'Entries · write' },
  { value: 'assets:read', label: 'Assets · read' },
  { value: 'assets:write', label: 'Assets · write' },
  { value: 'site_settings:read', label: 'Site settings · read' },
  { value: 'site_settings:write', label: 'Site settings · write' },
  { value: 'bundles:read', label: 'Export bundle · read' },
  { value: 'bundles:write', label: 'Import bundle · write' },
];

const DEFAULT_NEW_KEY_SCOPES = ['content_types:read', 'entries:read', 'assets:read', 'site_settings:read'];

type ApiKeyRow = {
  id: string;
  siteId: string;
  name: string;
  keyHint: string;
  scopes: string[];
  actingUserId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type SiteMemberOption = { id: string; email: string };

type ApiKeysPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  canManage: boolean;
};

export function ApiKeysPage({ token, workspaceSiteId, sites, canManage }: ApiKeysPageProps) {
  const activeSite = sites.find((site) => site.id === workspaceSiteId);
  useDocumentTitle(buildPageTitle('API keys', activeSite?.name?.trim() || 'Workspace'));

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(DEFAULT_NEW_KEY_SCOPES);
  const [actingUserId, setActingUserId] = useState<string>('');
  const [members, setMembers] = useState<SiteMemberOption[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpSaving, setMcpSaving] = useState(false);

  const hasWriteScopes = scopes.some((s) => s.endsWith(':write'));

  const loadKeys = useCallback(async () => {
    if (!workspaceSiteId || !canManage) {
      setKeys([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await gqlRequest<{
        apiKeys: ApiKeyRow[];
        siteSettings: { mcpEnabled: boolean };
      }>(
        token,
        `query($siteId:ID!){
          apiKeys(siteId:$siteId){
            id siteId name keyHint scopes actingUserId createdAt lastUsedAt
          }
          siteSettings(siteId:$siteId){ mcpEnabled }
        }`,
        { siteId: workspaceSiteId },
      );
      setKeys(response.apiKeys);
      setMcpEnabled(response.siteSettings.mcpEnabled);
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

  useEffect(() => {
    if (!createDialogOpen || !token || !workspaceSiteId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await gqlRequest<{
          globalUsers: Array<{ id: string; email: string; access: Array<{ siteId: string; role: string }> }>;
        }>(
          token,
          'query($siteId:ID!){ globalUsers(siteId:$siteId){ id email access { siteId role } } }',
          { siteId: workspaceSiteId },
        );
        if (cancelled) return;
        setMembers(
          data.globalUsers.map((u) => ({
            id: u.id,
            email: u.email,
          })),
        );
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createDialogOpen, token, workspaceSiteId]);

  function toggleScope(value: string, checked: boolean) {
    setScopes((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((s) => s !== value);
    });
  }

  async function handleCreate(event?: FormEvent) {
    event?.preventDefault();
    if (!canManage || !workspaceSiteId) return;
    setError('');
    if (!scopes.length) {
      setError('Select at least one scope.');
      return;
    }
    if (hasWriteScopes && !actingUserId) {
      setError('Choose an acting member for keys that include write access.');
      return;
    }
    setNewToken(null);
    setIsCreating(true);
    try {
      const response = await gqlRequest<{ createApiKey: { apiKey: ApiKeyRow; token: string } }>(
        token,
        `mutation($siteId:ID!,$name:String!,$scopes:[String!]!,$actingUserId:ID){
          createApiKey(siteId:$siteId,name:$name,scopes:$scopes,actingUserId:$actingUserId){
            apiKey { id siteId name keyHint scopes actingUserId createdAt lastUsedAt }
            token
          }
        }`,
        {
          siteId: workspaceSiteId,
          name: name.trim() || 'API key',
          scopes,
          actingUserId: hasWriteScopes ? actingUserId : null,
        },
      );
      setNewToken(response.createApiKey.token);
      setName('');
      setScopes(DEFAULT_NEW_KEY_SCOPES);
      setActingUserId('');
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

  function scopesSummary(list: string[]) {
    if (!list.length) return '—';
    if (list.length <= 2) return list.join(', ');
    return `${list.slice(0, 2).join(', ')} +${list.length - 2}`;
  }

  async function handleMcpToggle(next: boolean) {
    if (!workspaceSiteId) return;
    setMcpSaving(true);
    setError('');
    try {
      await gqlRequest<{ updateSiteSettings: { mcpEnabled: boolean } }>(
        token,
        `mutation($siteId:ID!,$input:SiteSettingsInput!){
          updateSiteSettings(siteId:$siteId,input:$input){ mcpEnabled }
        }`,
        { siteId: workspaceSiteId, input: { mcpEnabled: next } },
      );
      setMcpEnabled(next);
    } catch (mcpErr) {
      setError(mcpErr instanceof Error ? mcpErr.message : 'Failed to update MCP setting');
    } finally {
      setMcpSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="w-full space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>Headless access for your public site, SDK, or MCP.</CardDescription>
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
              Use{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code> or{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">x-api-key</code>. Each key is limited to{' '}
              <span className="font-medium">{activeSite?.name ?? 'this site'}</span> and the scopes you assign. Remote
              agents can use the same token against the MCP endpoint{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/mcp</code> on your API host.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => {
              setScopes(DEFAULT_NEW_KEY_SCOPES);
              setActingUserId('');
              setCreateDialogOpen(true);
            }}
          >
            Generate key
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (open) setError('');
              if (!open) {
                setName('');
                setScopes(DEFAULT_NEW_KEY_SCOPES);
                setActingUserId('');
              }
            }}
          >
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <form
                className="flex flex-col gap-6"
                onSubmit={(event) => {
                  void handleCreate(event);
                }}
              >
                <DialogHeader>
                  <DialogTitle>New API key</DialogTitle>
                  <DialogDescription>
                    Pick scopes and, if you enable any write scope, choose which site member the key acts as (for audit
                    trails and role checks).
                  </DialogDescription>
                </DialogHeader>
                {error && createDialogOpen ? (
                  <LoadErrorAlert
                    compact
                    title={null}
                    message={error}
                    onRetry={
                      error.startsWith('Select at least one scope') || error.startsWith('Choose an acting member')
                        ? undefined
                        : () => void loadKeys()
                    }
                  />
                ) : null}
                <div className="grid gap-4 py-2">
                  <Field>
                    <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                    <FieldContent>
                      <Input
                        id="api-key-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="e.g. Production site / MCP"
                        autoComplete="off"
                        autoFocus
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>Scopes</FieldLabel>
                    <FieldDescription>Read-only keys need no acting user. Write scopes require one.</FieldDescription>
                    <FieldContent className="grid gap-2 pt-1">
                      {KEY_SCOPE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={scopes.includes(opt.value)}
                            onCheckedChange={(v) => toggleScope(opt.value, v === true)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </FieldContent>
                  </Field>
                  {hasWriteScopes ? (
                    <Field>
                      <FieldLabel>Acting member</FieldLabel>
                      <FieldDescription>Must have a role on this site (editor+ for most writes).</FieldDescription>
                      <FieldContent>
                        <Select value={actingUserId} onValueChange={setActingUserId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  ) : null}
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

          {error && !createDialogOpen ? (
            <LoadErrorAlert title="API keys" message={error} onRetry={() => void loadKeys()} />
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Hint</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No active keys yet. Use <span className="font-medium text-foreground">Generate key</span> to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs" title={key.scopes.join(', ')}>
                        {scopesSummary(key.scopes)}
                      </TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>MCP endpoint</CardTitle>
          <CardDescription>
            The Model Context Protocol is served at <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/mcp</code>{' '}
            on your API. Turn it off to block agents from using API keys or workspace-scoped JWTs against this site,
            without stopping GraphQL.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
            <Checkbox
              checked={mcpEnabled}
              disabled={mcpSaving || isLoading}
              onCheckedChange={(v) => void handleMcpToggle(v === true)}
              className="mt-0.5"
            />
            <div className="min-w-0 space-y-1">
              <span className="text-sm font-medium leading-none">Allow MCP for this workspace</span>
              <p className="text-sm text-muted-foreground">
                When disabled, requests that identify this site (API keys, or a sign-in session tied to this workspace)
                receive <span className="font-mono text-xs">403</span> from <span className="font-mono text-xs">/api/mcp</span>
                . Only owners and admins can change this.
              </p>
            </div>
          </label>
          {mcpSaving ? <p className="text-xs text-muted-foreground">Saving…</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
