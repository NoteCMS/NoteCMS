import { cn } from '@/lib/utils';

type NoteWordmarkProps = {
  className?: string;
};

export function NoteWordmark({ className }: NoteWordmarkProps) {
  return (
    <p
      className={cn(
        'font-antiqua text-4xl font-bold leading-none tracking-tight text-foreground select-none dark:text-white',
        className,
      )}
      aria-label="note"
    >
      note
    </p>
  );
}
