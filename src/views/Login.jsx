import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, Zap } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/input';
import { ShimmerButton } from '../components/magicui/shimmer';
import { BorderBeam } from '../components/magicui/border-beam';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    const { error: err } = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);
    if (err) {
      setError(err.message);
    } else if (mode === 'signup') {
      setInfo('Controleer uw e-mail om uw account te bevestigen, en meld u daarna aan.');
      setMode('login');
    }
    setLoading(false);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
    setInfo('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F2E8] via-[#F8F5EB] to-[#F2EEE0] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-brand/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#ffabff]/15 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #c8d5e0 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.25,
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-[#280063]/30 rounded-2xl blur-xl" />
            <motion.div
              className="relative shadow-brand rounded-2xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 24, delay: 0.1 }}
            >
              <LogoMark size={56} className="rounded-2xl" />
            </motion.div>
          </div>
          <div className="text-center">
            <div className="font-bold text-[var(--text-primary)] text-xl tracking-tight">Punchlister</div>
            <div className="text-[var(--text-tertiary)] text-[10px] font-mono mt-1 tracking-widest uppercase">Construction · AI</div>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.15 }}
        >
          <BorderBeam duration={6}>
            <div className="p-7">
              {/* Mode heading */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === 'login' ? -8 : 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: mode === 'login' ? 8 : -8 }}
                  transition={spring}
                  className="mb-6"
                >
                  <h1 className="title-lg">
                    {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
                  </h1>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                    {mode === 'login' ? 'Aanmelden bij uw werkruimte.' : 'Begin met het beheren van uw projecten.'}
                  </p>
                </motion.div>
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.2 }}
                >
                  <label htmlFor="email" className="label-caps mb-2 block">E-mail</label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.25 }}
                >
                  <label htmlFor="password" className="label-caps mb-2 block">Wachtwoord</label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      className="pr-11"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <motion.button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer p-1"
                      whileTap={{ scale: 0.85 }}
                      transition={spring}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </motion.button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={spring}
                      className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl"
                    >
                      {error}
                    </motion.p>
                  )}
                  {info && (
                    <motion.p
                      role="status"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={spring}
                      className="text-[12px] text-[#075e48] bg-[#e8fbf5] border border-[#88f0d4] px-3 py-2.5 rounded-xl"
                    >
                      {info}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.3 }}
                >
                  <ShimmerButton type="submit" disabled={loading} className="w-full py-3 mt-1">
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />{mode === 'login' ? 'Aanmelden…' : 'Aanmaken…'}</>
                    ) : (
                      <><Zap className="w-4 h-4" />{mode === 'login' ? 'Aanmelden' : 'Account aanmaken'}</>
                    )}
                  </ShimmerButton>
                </motion.div>
              </form>

              <p className="text-center text-[12px] text-[var(--text-tertiary)] mt-6">
                {mode === 'login' ? 'Nog geen account?' : 'Al een account?'}{' '}
                <motion.button
                  type="button"
                  onClick={switchMode}
                  className="text-brand font-semibold hover:underline cursor-pointer"
                  whileTap={{ scale: 0.95 }}
                  transition={spring}
                >
                  {mode === 'login' ? 'Registreren' : 'Aanmelden'}
                </motion.button>
              </p>
            </div>
          </BorderBeam>
        </motion.div>
      </div>
    </div>
  );
}
