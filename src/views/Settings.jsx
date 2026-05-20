import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, CheckCircle2, Unlink, LogOut, User, Info,
  Loader2, Settings as SettingsIcon, ExternalLink,
  Shield, Bell, ChevronRight, MessageCircle, X,
} from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import {
  GMAIL_CONFIGURED,
  getGmailConnection,
  connectGmail,
  disconnectGmail,
  fetchGmailProfile,
  saveGmailConnection,
} from '../lib/gmail';

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

/* ─── Gmail section ──────────────────────────────────────────────────────── */
function GmailRow() {
  const [conn, setConn]             = useState(() => getGmailConnection());
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState('');

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { token, expiresIn } = await connectGmail();
      const profile = await fetchGmailProfile(token);
      setConn(saveGmailConnection({ token, expiresIn, email: profile.email }));
    } catch (err) {
      setError(err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    disconnectGmail();
    setConn(null);
  };

  if (conn) {
    return (
      <Row
        icon={Mail}
        iconBg="bg-[#e8fbf5]"
        label="Gmail"
        sublabel={conn.email}
        rightEl={
          <motion.button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-red-50"
            whileTap={{ scale: 0.92 }}
            transition={spring}
          >
            <Unlink className="w-3 h-3" /> Verbinding verbreken
          </motion.button>
        }
      >
        <CheckCircle2 className="w-4 h-4 text-[#0c7a5e] flex-shrink-0" />
      </Row>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Gmail</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
            Verbind uw Gmail om meerwerken en mails rechtstreeks vanuit de app te versturen.
          </p>
        </div>
      </div>

      {!GMAIL_CONFIGURED ? (
        <div className="ml-12 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Add <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">VITE_GOOGLE_CLIENT_ID</code> to your{' '}
            <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">.env</code> to enable Gmail.
          </p>
        </div>
      ) : (
        <div className="ml-12">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center gap-2"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verbinden…</>
              : <><Mail className="w-3.5 h-3.5" /> Gmail verbinden</>
            }
          </Button>
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[11px] text-red-600 mt-2 text-center"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ─── WhatsApp section ───────────────────────────────────────────────────── */
function WhatsAppRow() {
  const { user } = useAuth();
  const [conn, setConn]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [phone, setPhone]             = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('whatsapp_users')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        setConn(data || null);
        setLoading(false);
      });
  }, [user]);

  const openModal = () => {
    setPhone('');
    setError('');
    setSubmitted(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/whatsapp/optin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ phone_number: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Something went wrong.');
      setSubmitted(true);
      supabase
        .from('whatsapp_users')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
        .then(({ data }) => setConn(data || null));
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const handleDisconnect = async () => {
    if (!conn) return;
    setDisconnecting(true);
    await supabase
      .from('whatsapp_users')
      .update({ status: 'blocked' })
      .eq('id', conn.id);
    setConn(null);
    setDisconnecting(false);
  };

  if (loading) return null;

  if (conn) {
    return (
      <Row
        icon={MessageCircle}
        iconBg="bg-[#25D366]/10"
        label="WhatsApp"
        sublabel="WhatsApp verbonden ✓"
        rightEl={
          <motion.button
            onClick={disconnecting ? undefined : handleDisconnect}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-red-50"
            whileTap={{ scale: 0.92 }}
            transition={spring}
          >
            {disconnecting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <><Unlink className="w-3 h-3" /> Verbinding verbreken</>
            }
          </motion.button>
        }
      >
        <CheckCircle2 className="w-4 h-4 text-[#25D366] flex-shrink-0" />
      </Row>
    );
  }

  return (
    <>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-[#25D366]" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">WhatsApp</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
              Ontvang uw werfbezoekrapporten rechtstreeks op WhatsApp.
            </p>
          </div>
        </div>
        <div className="ml-12">
          <Button
            type="button"
            className="w-full justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0 shadow-none"
            onClick={openModal}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp verbinden
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeModal}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={spring}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-[#25D366]" />
                    </div>
                    <p className="text-[14px] font-bold text-[var(--text-primary)]">WhatsApp verbinden</p>
                  </div>
                  <motion.button
                    onClick={closeModal}
                    className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                    whileTap={{ scale: 0.92 }}
                    transition={spring}
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>

                {/* Body — swaps between form and confirmation */}
                <AnimatePresence mode="wait">
                  {submitted ? (
                    <motion.div
                      key="confirmation"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={spring}
                      className="px-5 py-8 flex flex-col items-center gap-3 text-center"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#25D366]/10 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-[#25D366]" />
                      </div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-snug">
                        Controleer uw WhatsApp — we hebben u een bevestigingsbericht gestuurd.
                      </p>
                      <Button variant="secondary" className="mt-1 w-full" onClick={closeModal}>
                        Klaar
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      onSubmit={handleSubmit}
                      className="px-5 py-5 space-y-4"
                    >
                      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                        Ontvang uw werfbezoekrapporten rechtstreeks op WhatsApp.
                      </p>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                          Telefoonnummer
                        </label>
                        <Input
                          type="tel"
                          placeholder="+32 478 00 00 00"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          autoFocus
                          required
                        />
                      </div>
                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>
                      <Button
                        type="submit"
                        className="w-full justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0 shadow-none"
                        disabled={submitting || !phone.trim()}
                      >
                        {submitting
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verzenden…</>
                          : 'Bevestiging verzenden'
                        }
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Main view ──────────────────────────────────────────────────────────── */
export default function Settings({ onOpenProjectSettings }) {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName]             = useState(user?.user_metadata?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved]   = useState(false);

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

          <Row
            icon={LogOut}
            label="Afmelden"
            danger
            onClick={signingOut ? undefined : handleSignOut}
            rightEl={signingOut ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : undefined}
          />
        </Section>

        {/* Integrations */}
        <Section
          title="Integraties"
          description="Verbind externe diensten."
        >
          <GmailRow />
          <WhatsAppRow />
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
