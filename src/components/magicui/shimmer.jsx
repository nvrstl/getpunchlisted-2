import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export function ShimmerButton({ children, className, onClick, type = 'button', disabled }) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full',
        'bg-brand text-white font-semibold text-[14px] cursor-pointer select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'px-5 py-2.5',
        className
      )}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
    >
      <motion.span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.30) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
        }}
        initial={{ backgroundPosition: '-200% 0' }}
        whileHover={{ backgroundPosition: '200% 0' }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        aria-hidden
      />
      <span className="relative flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
