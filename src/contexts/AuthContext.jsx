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

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

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
      if (event === 'SIGNED_IN' && session?.user) {
        identifyUser(session.user);
        syncMemberships(session);
      }
      if (event === 'SIGNED_OUT') {
        resetUser();
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp  = (email, password) => supabase.auth.signUp({ email, password });
  const signOut = ()                 => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
