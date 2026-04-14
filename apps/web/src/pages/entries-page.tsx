import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Site } from '@/types/app';

type EntriesPageProps = {
  workspaceSiteId: string;
  sites: Site[];
};

export function EntriesPage({ workspaceSiteId, sites }: EntriesPageProps) {
  const activeSite = sites.find((site) => site.id === workspaceSiteId);

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Content Entries</CardTitle>
          <CardDescription>
            Workspace scope: {activeSite ? `${activeSite.name} (${activeSite.url})` : 'No workspace selected'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Entries will load for the selected workspace by default.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
