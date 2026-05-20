import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { LogoMark } from '../components/Logo';

const navItems = [
  { id: 'backoffice', label: 'Dashboard', icon: LayoutGrid },
];

export default function BackofficeShell({ currentView, onNavigate, onBackToApp, children }) {
  const activeId = currentView === 'backoffice' ? 'backoffice' : 'bedrijven';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface-2)' }}>
      {/* Ambient orbs */}
      <div className="orb orb-1" aria-hidden />
      <div className="orb orb-2" aria-hidden />

      {/* Backoffice sidebar */}
      <aside
        className="w-[220px] hidden md:flex flex-col flex-shrink-0 select-none relative z-10"
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Logo area */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-[#7669ff]/35 rounded-[11px] blur-md" />
              <LogoMark size={32} className="relative rounded-[11px] shadow-brand-sm" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-white tracking-tight leading-none">Punchlister</div>
              <div className="text-[10px] text-white/40 font-mono mt-0.5 tracking-wide uppercase">Backoffice</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
          <div className="px-3 pt-3 pb-2.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Navigatie</div>
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeId === id;
            return (
              <motion.button
                key={id}
                onClick={() => onNavigate(id === 'bedrijven' ? 'backoffice' : 'backoffice')}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 cursor-pointer relative overflow-hidden',
                  active ? 'text-white' : 'text-white/40 hover:text-white/70'
                )}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <AnimatePresence>
                  {active && (
                    <motion.span
                      layoutId="bo-nav-bg"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.08)' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {active && (
                    <motion.span
                      layoutId="bo-nav-accent"
                      className="absolute left-0 top-1/2 w-[3px] h-[18px] -translate-y-1/2 rounded-r-full bg-brand"
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      exit={{ scaleY: 0 }}
                    />
                  )}
                </AnimatePresence>
                <Icon className={cn('w-4 h-4 flex-shrink-0 relative', active && 'text-brand')} strokeWidth={active ? 2.5 : 1.75} />
                <span className={cn('text-[13px] font-medium flex-1 leading-none relative', active && 'font-semibold')}>{label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Log out */}
        <div className="p-3 border-t border-white/10">
          <motion.button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-medium">Uitloggen</span>
          </motion.button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative z-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="min-h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
