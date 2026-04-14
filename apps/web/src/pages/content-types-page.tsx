import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Site } from '@/types/app';

type ContentTypesPageProps = {
  workspaceSiteId: string;
  sites: Site[];
};

export function ContentTypesPage({ workspaceSiteId, sites }: ContentTypesPageProps) {
  const activeSite = sites.find((site) => site.id === workspaceSiteId);

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Schema Builder</CardTitle>
          <CardDescription>
            Workspace scope: {activeSite ? `${activeSite.name} (${activeSite.url})` : 'No workspace selected'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Content types will be created and managed within the currently selected workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
