import { clsx } from 'clsx';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'h-12 w-full rounded-full border border-[var(--border)] bg-white/50 px-5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/30 focus-visible:ring-offset-2',
        className,
      )}
    />
  );
}
