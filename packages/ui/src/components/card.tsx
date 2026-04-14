import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={clsx(
        'rounded-[2rem] border border-[var(--border)]/60 bg-[#FEFEFA]/90 p-6 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1',
        className,
      )}
    />
  );
}
