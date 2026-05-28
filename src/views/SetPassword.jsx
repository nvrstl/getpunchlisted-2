import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/input';
import { ShimmerButton } from '../components/magicui/shimmer';
import { LogoMark } from '../components/Logo';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

// Forced when the user arrives via a Supabase invite or password-recovery
// link (AuthContext sets needsPasswordSet=true). Blocks all app navigation
// until they set a password — they can't get to the dashboard otherwise.
export default function SetPassword() {
  const { user, clearPasswordSetFlag } = useAuth();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Wachtwoord moet minstens 6 tekens bevatten.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    clearPasswordSetFlag();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F2E8] via-[#F8F5EB] to-[#F2EEE0] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-brand/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#ffabff]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-[#280063]/30 rounded-2xl blur-xl" />
            <LogoMark size={56} className="relative rounded-2xl shadow-brand" />
          </div>
          <div className="text-center">
            <div className="font-bold text-[var(--text-primary)] text-xl tracking-tight">Punchlister</div>
            <div className="text-[var(--text-tertiary)] text-[10px] font-mono mt-1 tracking-widest uppercase">Welkom</div>
          </div>
        </motion.div>

        <motion.div
          className="glass-card rounded-2xl p-7"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.1 }}
        >
          <div className="mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center mb-3">
              <KeyRound className="w-5 h-5 text-brand" />
            </div>
            <h1 className="title-lg">Stel uw wachtwoord in</h1>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              {user?.email
                ? <>U bent ingelogd als <strong>{user.email}</strong>. Kies een wachtwoord om uw account te activeren.</>
                : 'Kies een wachtwoord om verder te gaan.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="label-caps mb-2 block">Nieuw wachtwoord</label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPw ? 'text' : 'password'}
                  className="pr-11"
                  placeholder="Min. 6 tekens"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer p-1"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">
                {error}
              </p>
            )}

            <ShimmerButton type="submit" disabled={saving || password.length < 6} className="w-full py-3 mt-1">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Opslaan…</>
                : <><KeyRound className="w-4 h-4" /> Wachtwoord opslaan</>
              }
            </ShimmerButton>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
