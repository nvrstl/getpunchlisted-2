import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};

const spring = { type: 'spring', stiffness: 280, damping: 30 };

export function PageTransition({ children, id }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={spring}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
