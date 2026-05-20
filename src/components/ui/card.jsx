import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const Card = React.forwardRef(({ className, hover = false, ...props }, ref) => {
  if (hover) {
    return (
      <motion.div
        ref={ref}
        className={cn('rounded-2xl bg-white shadow-card overflow-hidden', className)}
        whileHover={{ y: -2, boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), 0 20px 40px rgba(0,0,0,0.08)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        {...props}
      />
    );
  }
  return (
    <div
      ref={ref}
      className={cn('rounded-2xl bg-white shadow-card', className)}
      {...props}
    />
  );
});
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1 p-5 pb-3', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-semibold text-[var(--text-primary)] text-[13px] leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-[var(--text-tertiary)]', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
