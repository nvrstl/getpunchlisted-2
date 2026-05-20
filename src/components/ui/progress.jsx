import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const Progress = React.forwardRef(({ className, value, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]', className)}
    {...props}
  >
    <motion.div
      className="h-full rounded-full bg-brand"
      initial={{ width: 0 }}
      animate={{ width: `${value || 0}%` }}
      transition={{ type: 'spring', stiffness: 60, damping: 20, delay: 0.1 }}
    />
  </div>
));
Progress.displayName = 'Progress';

export { Progress };
