import { useEffect, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildStatusLine,
  buildTriggerBlockedReason,
  canTriggerBuild,
  isBuildInProgress,
  type SiteBuildGql,
  triggerSiteBuildRequest,
} from '@/lib/site-builds';
import { toast } from 'sonner';

type SiteBuildsRunListProps = {
  token: string;
  siteId: string;
  builds: SiteBuildGql[];
  siteRole?: string;
  isGlobalAdmin?: boolean;
  onTriggered?: () => void | Promise<void>;
  emptyMessage?: string;
};

export function SiteBuildsRunList({
  token,
  siteId,
  builds,
  siteRole,
  isGlobalAdmin = false,
  onTriggered,
  emptyMessage = 'No builds yet.',
}: SiteBuildsRunListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasRunningBuild = builds.some(isBuildInProgress);

  useEffect(() => {
    if (!hasRunningBuild || !onTriggered) return;
    const timer = window.setInterval(() => {
      void onTriggered();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasRunningBuild, onTriggered]);

  async function handleRun(build: SiteBuildGql) {
    setBusyId(build.id);
    try {
      const result = await triggerSiteBuildRequest(token, siteId, build.id);
      if (result.ok) toast.success(`${build.label} deploy started`);
      else toast.error(result.message || 'Could not start deploy');
      await onTriggered?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start deploy');
    } finally {
      setBusyId(null);
    }
  }

  if (builds.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ItemGroup className="gap-2">
      {builds.map((build) => {
        const canRun = canTriggerBuild(build, siteRole, isGlobalAdmin);
        const blocked = buildTriggerBlockedReason(build, siteRole, isGlobalAdmin);
        const runButton = (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={!canRun || busyId === build.id}
            onClick={() => void handleRun(build)}
          >
            {busyId === build.id ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 size-4" aria-hidden />
            )}
            Run
          </Button>
        );

        return (
          <Item
            key={build.id}
            variant="muted"
            className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <ItemContent className="min-w-0 gap-0.5">
              <p className="text-sm font-medium text-foreground">{build.label}</p>
              <p className="text-xs text-muted-foreground">
                {build.slug}
                {build.triggerMinRole === 'owner' ? ' · owners only' : ''}
              </p>
              <p className="text-xs text-muted-foreground">{buildStatusLine(build)}</p>
            </ItemContent>
            {blocked && !canRun ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0">{runButton}</span>
                </TooltipTrigger>
                <TooltipContent side="left">{blocked}</TooltipContent>
              </Tooltip>
            ) : (
              runButton
            )}
          </Item>
        );
      })}
    </ItemGroup>
  );
}
