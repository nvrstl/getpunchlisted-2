import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, LogOut,
  Loader2, Settings as SettingsIcon, ExternalLink,
  Shield, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 320, damping: 30 };

function Section({ title, description, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="mb-2.5">
        <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest px-1">{title}</p>
        {description && <p className="text-[12px] text-[var(--text-tertiary)] px-1 mt-0.5">{description}</p>}
      </div>
      <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden divide-y divide-[var(--border-color)]/60">
        {children}
      </div>
    </motion.div>
  );
}

function Row({ icon: Icon, iconBg, label, sublabel, onClick, danger, rightEl, children }) {
  const content = (
    <>
      {Icon && (
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          danger ? 'bg-red-50' : iconBg || 'bg-[var(--surface-2)]'
        )}>
          <Icon className={cn('w-4 h-4', danger ? 'text-red-500' : 'text-[var(--text-secondary)]')} strokeWidth={2} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn('text-[13px] font-semibold leading-snug', danger ? 'text-red-600' : 'text-[var(--text-primary)]')}>
          {label}
        </p>
        {sublabel && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">{sublabel}</p>}
      </div>
      {rightEl}
      {children}
      {onClick && !rightEl && !children && (
        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
      )}
    </>
  );

  if (onClick) {
    return (
      <motion.button
        onClick={onClick}
        className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-white/60 cursor-pointer"
        whileTap={{ scale: 0.99 }}
        transition={spring}
      >
        {content}
      </motion.button>
    );
  }
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      {content}
    </div>
  );
}


/* ─── Main view ──────────────────────────────────────────────────────────── */
export default function Settings({ onOpenProjectSettings }) {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName]             = useState(user?.user_metadata?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved]   = useState(false);

  // Password set/change — used both by invited users (who land logged-in
  // via magic link with no password) and existing users wanting to update.
  const [password, setPassword]       = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [savingPw, setSavingPw]       = useState(false);
  const [pwSaved, setPwSaved]         = useState(false);
  const [pwError, setPwError]         = useState('');

  useEffect(() => {
    setName(user?.user_metadata?.full_name ?? '');
  }, [user?.user_metadata?.full_name]);

  const initials = (user?.email || '?')[0].toUpperCase();

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (savingName) return;
    if (trimmed === (user?.user_metadata?.full_name ?? '')) return;
    setSavingName(true);
    setNameSaved(false);
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSavingName(false);
    if (!error) {
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    }
  };

  const handleSavePassword = async (e) => {
    e?.preventDefault();
    setPwError('');
    setPwSaved(false);
    if (password.length < 6) {
      setPwError('Wachtwoord moet minstens 6 tekens bevatten.');
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPw(false);
    if (error) {
      setPwError(error.message);
      return;
    }
    setPassword('');
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 3000);
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto pb-28 md:pb-10">
      {/* Page header */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
            <SettingsIcon className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <h1 className="title-xl">Instellingen</h1>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] ml-12">Beheer uw account en integraties.</p>
      </motion.div>

      <div className="space-y-6">
        {/* Account */}
        <Section title="Account">
          {/* Avatar + email */}
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-brand/20 rounded-2xl blur-md" />
              <div className="relative w-12 h-12 rounded-2xl bg-brand flex items-center justify-center shadow-brand-sm">
                <span className="text-[16px] font-bold text-white">{initials}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-[var(--text-primary)] truncate">{user?.email}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Aangemeld via e-mail</p>
            </div>
          </div>

          {/* Name editor */}
          <div className="px-5 py-4">
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">Naam</label>
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setNameSaved(false); }}
                onBlur={handleSaveName}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                placeholder="Voornaam Achternaam"
                className="flex-1 text-[13px]"
                disabled={savingName}
              />
              {savingName && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-tertiary)]" />}
              {nameSaved && !savingName && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">Wordt gebruikt voor de begroeting op je dashboard.</p>
          </div>

          {/* Password set/change */}
          <form onSubmit={handleSavePassword} className="px-5 py-4 border-t border-[var(--border-color)]">
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
              Wachtwoord
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPwError(''); setPwSaved(false); }}
                  placeholder="Nieuw wachtwoord (min. 6 tekens)"
                  className="text-[13px] pr-9"
                  disabled={savingPw}
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer p-1"
                  tabIndex={-1}
                  aria-label={showPw ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <Button type="submit" size="sm" disabled={savingPw || password.length < 6}>
                {savingPw
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : pwSaved
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Opgeslagen</>
                    : 'Opslaan'}
              </Button>
            </div>
            {pwError && (
              <p className="text-[11px] text-red-600 mt-1.5">{pwError}</p>
            )}
            {!pwError && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                Stel een wachtwoord in om voortaan zonder magic link aan te melden.
              </p>
            )}
          </form>

          <Row
            icon={LogOut}
            label="Afmelden"
            danger
            onClick={signingOut ? undefined : handleSignOut}
            rightEl={signingOut ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : undefined}
          />
        </Section>

        {/* Project — only when a project is open */}
        {onOpenProjectSettings && (
          <Section title="Project">
            <Row
              icon={SettingsIcon}
              label="Projectinstellingen"
              sublabel="Naam, status, teamleden, datums"
              onClick={onOpenProjectSettings}
            />
          </Section>
        )}

        {/* About */}
        <Section title="Over">
          <div className="flex items-center gap-3.5 px-5 py-4">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-[#280063]/20 rounded-xl blur-sm" />
              <LogoMark size={36} radius={12} className="relative rounded-xl" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-[var(--text-primary)]">Punchlister</p>
              <p className="text-[11px] text-[var(--text-tertiary)] font-mono">AI · v1.0</p>
            </div>
          </div>
          <Row
            icon={Shield}
            label="Privacy & Voorwaarden"
            sublabel="Gegevens veilig opgeslagen in Supabase"
            rightEl={<ExternalLink className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
          />
        </Section>
      </div>
    </div>
  );
}
