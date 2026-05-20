import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-brand text-white',
        secondary:   'bg-[var(--surface-3)] text-[var(--text-secondary)]',
        destructive: 'bg-red-50 text-red-600 border border-red-100',
        outline:     'text-[var(--text-secondary)] border border-[var(--border-color)]',
        success:     'bg-[#e8fbf5] text-[#075e48] border border-[#b2f9eb]',
        warning:     'bg-amber-50 text-amber-700 border border-amber-100',
        info:        'bg-blue-50 text-blue-600 border border-blue-100',
        purple:      'bg-violet-50 text-violet-600 border border-violet-100',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
