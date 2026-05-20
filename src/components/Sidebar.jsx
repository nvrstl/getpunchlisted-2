import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, FolderOpen, Settings as Cog, ShieldCheck, Building2, ChevronDown, Plus, Check, Inbox, History } from 'lucide-react';
import { LogoMark } from './Logo';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const STATUS_COLORS = {
  pre_construction: '#6366F1',
  active:           '#7669ff',
  punch_phase:      '#F59E0B',
  completed:        '#6B7280',
};

// Slim top bar replacing the rail. Renders horizontally.
// Exported under the same name `Sidebar` so App.jsx wiring stays intact.
export default function Sidebar({
  currentView,
  onNavigate,
  project,
  projects = [],
  onSelectProject,
  onCreateProject,
  onChangeProject,
  userEmail,
  isPlatformAdmin,
  onNavigateBackoffice,
  inboxCount = 0,
  onRecord,
  extraActions,
}) {
  const isAdmin = ADMIN_EMAILS.length === 0 ? false : ADMIN_EMAILS.includes((userEmail || '').toLowerCase());
  const initials = (userEmail || '?').split('@')[0].slice(0, 2).toUpperCase();
  const statusColor = STATUS_COLORS[project?.status] || '#7669ff';

  return (
    <header
      className="hidden md:flex h-12 flex-shrink-0 items-center px-5 gap-4 select-none relative z-30"
      style={{
        background: 'rgba(245,242,232,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(40,0,99,0.06)',
      }}
    >
      {/* Logo + wordmark */}
      <button
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-2 cursor-pointer"
        title="Vandaag"
      >
        <LogoMark size={22} withBackground={false} />
        <span className="text-[14px] font-semibold tracking-tight text-[#0c0040]">
          Punchlister
        </span>
      </button>

      <span className="w-px h-4 bg-black/10" />

      {/* Project switcher dropdown */}
      <ProjectSwitcher
        project={project}
        projects={projects}
        statusColor={statusColor}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onAllProjects={onChangeProject}
      />

      {inboxCount > 0 && (
        <span
          className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ background: '#ece9ff', color: '#3a31a8' }}
          title={`${inboxCount} memo${inboxCount === 1 ? '' : "'s"} te verwerken`}
        >
          {inboxCount}
        </span>
      )}

      {/* Project view tabs — only when a project is loaded */}
      {project && (
        <div className="ml-2 inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-black/[0.04]">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors ${
              currentView === 'dashboard' ? 'bg-white text-[#0c0040] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[#0c0040]'
            }`}
            title="Vandaag"
          >
            <Inbox className="w-3.5 h-3.5" /> Vandaag
          </button>
          <button
            onClick={() => onNavigate('timeline')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors ${
              currentView === 'timeline' ? 'bg-white text-[#0c0040] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[#0c0040]'
            }`}
            title="Project-tijdlijn"
          >
            <History className="w-3.5 h-3.5" /> Geschiedenis
          </button>
        </div>
      )}

      {/* Project-scoped actions (Context / Contacten / Chat) — only when a project is loaded */}
      {project && extraActions ? (
        <div className="ml-2">{extraActions}</div>
      ) : null}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Admin / Backoffice slot — quietly tucked at right */}
      {isAdmin && currentView !== 'admin' && (
        <button
          onClick={() => onNavigate('admin')}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-[#0c0040] cursor-pointer"
          title="Admin"
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
      )}
      {isPlatformAdmin && (
        <button
          onClick={onNavigateBackoffice}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-[#0c0040] cursor-pointer"
          title="Backoffice"
        >
          <Building2 className="w-4 h-4" />
        </button>
      )}

      {/* Mic — primary action */}
      {onRecord && project && (
        <motion.button
          onClick={onRecord}
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.04 }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-[12px] font-medium"
          style={{ background: '#280063', color: '#fff' }}
          title="Memo opnemen"
        >
          <Mic className="w-3.5 h-3.5" /> Memo
        </motion.button>
      )}

      {/* Settings button */}
      <button
        onClick={() => onNavigate('settings')}
        className="text-[var(--text-tertiary)] hover:text-[#0c0040] cursor-pointer"
        title="Instellingen"
      >
        <Cog className="w-4 h-4" />
      </button>

      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #7669ff 0%, #ffabff 100%)',
          color: '#280063',
        }}
        title={userEmail || ''}
      >
        <span className="text-[10px] font-extrabold">{initials}</span>
      </div>
    </header>
  );
}

const STATUS_DOT = {
  pre_construction: '#6366F1',
  active:           '#7669ff',
  punch_phase:      '#F59E0B',
  completed:        '#6B7280',
};

function ProjectSwitcher({ project, projects, statusColor, onSelectProject, onCreateProject, onAllProjects }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!project) {
    return <span className="text-[13px] text-[var(--text-tertiary)]">Geen project</span>;
  }

  const others = projects.filter(p => p.id !== project.id);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-black/[0.04] cursor-pointer transition-colors"
        title="Project wisselen"
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
        <span className="text-[13px] text-[#0c0040] font-medium truncate max-w-[280px]">
          {project.name}
        </span>
        <ChevronDown className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-9 z-50 paper-card overflow-hidden"
            style={{ minWidth: 280, maxWidth: 360 }}
          >
            {/* Current */}
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Actief project
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0c0040] truncate">{project.name}</div>
                {(project.project_number || project.city) && (
                  <div className="text-[10.5px] text-[var(--text-tertiary)] truncate">
                    {[project.project_number, project.city].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <Check className="w-3.5 h-3.5 text-[#7669ff] flex-shrink-0" />
            </div>

            {/* Others */}
            {others.length > 0 && (
              <>
                <div className="border-t border-black/5 mx-3 my-1" />
                <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Wissel naar
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {others.map(p => {
                    const dot = STATUS_DOT[p.status] || '#7669ff';
                    return (
                      <button
                        key={p.id}
                        onClick={() => { onSelectProject?.(p); setOpen(false); }}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-black/[0.04] cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-[#0c0040] truncate">{p.name}</div>
                          {(p.project_number || p.city) && (
                            <div className="text-[10.5px] text-[var(--text-tertiary)] truncate">
                              {[p.project_number, p.city].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="border-t border-black/5 mx-3 my-1" />
            <div className="py-1">
              {onAllProjects && (
                <button
                  onClick={() => { onAllProjects(); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)] hover:bg-black/[0.04] hover:text-[#0c0040] cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Alle projecten
                </button>
              )}
              {onCreateProject && (
                <button
                  onClick={() => { onCreateProject(); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12.5px] text-[#7669ff] hover:bg-black/[0.04] cursor-pointer font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nieuw project
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
