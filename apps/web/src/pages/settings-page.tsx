import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Workspace Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--muted-foreground)]">Configure environment, API keys, and defaults for Note CMS.</p>
        </CardContent>
      </Card>
    </div>
  );
}
