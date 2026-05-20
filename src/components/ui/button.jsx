import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:     'bg-brand text-white hover:bg-[#36B879] shadow-brand-sm hover:shadow-brand rounded-full',
        secondary:   'bg-white text-slate-700 border border-[var(--border-color)] hover:bg-slate-50 hover:border-slate-300 rounded-full shadow-sm',
        ghost:       'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] rounded-xl',
        destructive: 'bg-red-500 text-white hover:bg-red-600 rounded-full',
        outline:     'border border-[var(--border-color)] bg-white hover:bg-slate-50 rounded-full shadow-sm',
        link:        'text-brand underline-offset-4 hover:underline p-0 h-auto font-semibold',
      },
      size: {
        default: 'h-10 px-5 py-2.5 text-sm',
        sm:      'h-8 px-4 text-xs',
        lg:      'h-12 px-7 text-[15px]',
        icon:    'h-9 w-9 rounded-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const springTap = { whileTap: { scale: 0.95 }, transition: { type: 'spring', stiffness: 500, damping: 25 } };

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  if (asChild) {
    const Comp = Slot;
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
  return (
    <motion.button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      whileTap={springTap.whileTap}
      transition={springTap.transition}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
