import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type LoadErrorAlertProps = {
  message: string;
  /** Shown above the message; omit with `compact` to use a single-line emphasis only when you pass a title. */
  title?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  /** Tighter padding; omit default title unless `title` is set. */
  compact?: boolean;
};

export function LoadErrorAlert({
  message,
  title,
  onRetry,
  retryLabel = 'Try again',
  className,
  compact,
}: LoadErrorAlertProps) {
  const displayTitle = title !== undefined ? title : compact ? null : "Couldn't complete this";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 shadow-sm dark:border-destructive/35 dark:bg-destructive/10',
        compact && 'px-3 py-2.5',
        className,
      )}
    >
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {displayTitle ? <p className="text-sm font-medium text-foreground">{displayTitle}</p> : null}
          <p className={cn('text-sm leading-snug', displayTitle ? 'text-muted-foreground' : 'text-foreground')}>{message}</p>
          {onRetry ? (
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
