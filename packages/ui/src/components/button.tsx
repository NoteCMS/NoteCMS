import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost';

export function Button({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variant = (props as any).variant ?? 'primary';
  return (
    <button
      {...props}
      className={clsx(
        'h-12 rounded-full px-8 font-semibold transition-all duration-300 active:scale-95',
        variant === 'primary' && 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-soft)] hover:scale-105',
        variant === 'outline' && 'border-2 border-[var(--secondary)] text-[var(--secondary)] hover:bg-[var(--secondary)]/10',
        variant === 'ghost' && 'text-[var(--primary)] hover:bg-[var(--primary)]/10',
        className,
      )}
    >
      {children}
    </button>
  );
}
