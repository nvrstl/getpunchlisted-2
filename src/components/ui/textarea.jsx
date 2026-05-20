import * as React from 'react';
import { cn } from '../../lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] px-4 py-3 resize-none',
      'text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
      'focus:outline-none focus:bg-white focus:border-brand/50 focus:ring-2 focus:ring-brand/12',
      'transition-all duration-200',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    style={{ fontSize: 16 }}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
