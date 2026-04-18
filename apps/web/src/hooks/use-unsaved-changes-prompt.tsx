import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type UseUnsavedChangesPromptOptions = {
  /** When true, in-app navigation and refresh/close tab show a confirmation. */
  isDirty: boolean;
  /** Optional override for the dialog title. */
  title?: string;
  /** Optional override for the description. */
  description?: string;
};

/**
 * Blocks client-side navigation (links, sidebar, programmatic navigate) when `isDirty`,
 * shows a confirmation dialog, and warns on tab close / refresh via `beforeunload`.
 * Requires the app to be rendered under `RouterProvider` (data router).
 */
export function useUnsavedChangesPrompt({
  isDirty,
  title = 'Discard unsaved changes?',
  description = 'You have unsaved changes. If you leave now, they will be lost.',
}: UseUnsavedChangesPromptOptions) {
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const open = blocker.state === 'blocked';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) blocker.reset?.();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => blocker.reset?.()}>
            Stay on page
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
