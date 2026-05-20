import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export function BorderBeam({ children, className, duration = 5 }) {
  return (
    <div className={cn('relative rounded-2xl p-[1.5px] overflow-hidden', className)}>
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: 'conic-gradient(from 0deg, transparent 60%, #7669ff 75%, transparent 90%)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
        aria-hidden
      />
      <div className="relative rounded-2xl bg-white">
        {children}
      </div>
    </div>
  );
}
