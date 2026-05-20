import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export function AnimatedNumber({ value, duration = 0.8, className = '' }) {
  const spring = useSpring(0, { stiffness: 60, damping: 18 });
  const display = useTransform(spring, v => Math.round(v));

  useEffect(() => { spring.set(value); }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
