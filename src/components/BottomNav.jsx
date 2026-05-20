import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Settings, History } from 'lucide-react';
import { cn } from '../lib/utils';

const items = [
  { id: 'dashboard', label: 'Vandaag',     icon: Inbox },
  { id: 'timeline',  label: 'Geschiedenis', icon: History },
];

export default function BottomNav({ currentView, onNavigate }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-[rgba(255,255,255,0.8)]"
      aria-label="Hoofdnavigatie"
    >
      <div className="flex items-stretch" style={{ height: 64 }}>
        {items.map(({ id, label, icon: Icon }) => {
          const active = currentView === id;
          return (
            <motion.button
              key={id}
              onClick={() => onNavigate(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 relative',
                'min-h-[44px] min-w-[44px] cursor-pointer',
                active ? 'text-brand' : 'text-[var(--text-tertiary)]'
              )}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            >
              {/* Active pill indicator */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute top-1 left-1/2 w-10 h-[3px] rounded-full bg-brand -translate-x-1/2"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </AnimatePresence>

              {/* Active icon bg bubble */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="bottom-nav-bg"
                    className="absolute w-12 h-8 rounded-full bg-brand/10"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
              </AnimatePresence>

              <Icon
                className="w-[18px] h-[18px] relative"
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span className={cn('text-[10px] font-semibold relative tracking-wide', active ? 'opacity-100' : 'opacity-60')}>
                {label}
              </span>
            </motion.button>
          );
        })}

        {/* Settings */}
        <motion.button
          onClick={() => onNavigate('settings')}
          aria-label="Instellingen"
          aria-current={currentView === 'settings' ? 'page' : undefined}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-1 relative',
            'min-h-[44px] min-w-[44px] cursor-pointer',
            currentView === 'settings' ? 'text-brand' : 'text-[var(--text-tertiary)]'
          )}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        >
          <AnimatePresence>
            {currentView === 'settings' && (
              <motion.span
                layoutId="bottom-nav-indicator"
                className="absolute top-1 left-1/2 w-10 h-[3px] rounded-full bg-brand -translate-x-1/2"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                exit={{ scaleX: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </AnimatePresence>
          <Settings className="w-[18px] h-[18px] relative" strokeWidth={currentView === 'settings' ? 2.5 : 1.75} />
          <span className={cn('text-[10px] font-semibold tracking-wide relative', currentView === 'settings' ? 'opacity-100' : 'opacity-60')}>
            Instellingen
          </span>
        </motion.button>
      </div>
      <div className="h-safe-bottom" style={{ background: 'rgba(255,255,255,0.72)' }} />
    </nav>
  );
}
