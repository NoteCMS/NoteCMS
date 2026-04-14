import { useState } from 'react';
import type { FormEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateSite(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setError('');
    setIsSubmitting(true);
    try {
      await gqlRequest(
        token,
        'mutation($name:String!,$url:String!){ createSite(name:$name,url:$url){ id } }',
        { name, url },
      );
      setName('');
      setUrl('');
      await onSitesChanged();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create site');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>Admins can create new CMS workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleCreateSite}>
              <div className="space-y-2">
                <Label htmlFor="site-name">Site name</Label>
                <Input id="site-name" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-url">Site URL</Label>
                <Input id="site-url" value={url} onChange={(event) => setUrl(event.target.value)} required />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Site'}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Only admins can create new sites.</p>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Sites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sites.length ? (
            sites.map((site) => (
              <div key={site.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{site.name}</p>
                <p className="text-xs text-muted-foreground">{site.url}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No sites available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
