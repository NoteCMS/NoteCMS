import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-[var(--muted-foreground)]">Overview</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Sites</CardDescription>
            <CardTitle>3</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Content Types</CardDescription>
            <CardTitle>12</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Entries</CardDescription>
            <CardTitle>248</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Recent activity</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>Updated homepage sections on demo-site</li>
            <li>Added repeater field to blog content type</li>
            <li>Invited a new editor to docs-site</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
