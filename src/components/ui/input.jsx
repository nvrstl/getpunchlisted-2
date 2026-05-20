import * as React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-10 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] px-4 py-2.5',
      'text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
      'focus:outline-none focus:bg-white focus:border-brand/50 focus:ring-2 focus:ring-brand/12',
      'transition-all duration-200',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className
    )}
    style={{ fontSize: 16, ...props.style }}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
