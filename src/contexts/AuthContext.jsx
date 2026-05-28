import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { identifyUser, resetUser } from '../lib/posthog';

const AuthContext = createContext(null);

async function syncMemberships(session) {
  if (!session?.access_token) return;
  try {
    await fetch('/api/auth/sync-memberships', {
      method:  'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch (e) { console.warn('sync-memberships failed:', e.message); }
}

// Detects whether the user just landed on the app via a Supabase invite
// link or password-recovery link. Supabase clears the hash before
// onAuthStateChange fires, so we have to read it first thing on module load.
function detectRecoveryFromHash() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return /[#&]type=(recovery|invite)\b/.test(hash);
}
const INITIAL_RECOVERY = detectRecoveryFromHash();

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  // True when the current session was opened via an invite or password-recovery
  // link and the user hasn't set a permanent password yet. App shows a
  // dedicated SetPassword screen until this flips to false.
  const [needsPasswordSet, setNeedsPasswordSet] = useState(INITIAL_RECOVERY);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 6000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        identifyUser(session.user);
        syncMemberships(session);
      }
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSet(true);
      }
      if (event === 'SIGNED_IN' && session?.user) {
        identifyUser(session.user);
        syncMemberships(session);
      }
      if (event === 'SIGNED_OUT') {
        resetUser();
        setNeedsPasswordSet(false);
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp  = (email, password) => supabase.auth.signUp({ email, password });
  const signOut = ()                 => supabase.auth.signOut();
  // Called by SetPassword once the user has stored a new password.
  const clearPasswordSetFlag = ()    => setNeedsPasswordSet(false);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, needsPasswordSet, clearPasswordSetFlag }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
