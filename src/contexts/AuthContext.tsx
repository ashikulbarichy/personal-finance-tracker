import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isRecovery: boolean;
  clearRecovery: () => void;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('access_token=') ||
      window.location.search.includes('type=recovery') ||
      window.location.search.includes('code=') ||
      window.location.search.includes('token_hash=')
    );
  });

  const clearRecovery = () => {
    setIsRecovery(false);
  };

  useEffect(() => {
    const isRecoveryUrl =
      window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('access_token=') ||
      window.location.search.includes('type=recovery') ||
      window.location.search.includes('code=') ||
      window.location.search.includes('token_hash=') ||
      window.location.pathname === '/reset-password';

    const remember = localStorage.getItem('fin_remember_me');

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }

      // If the last login was "do NOT keep me logged in",
      // clear any persisted session on reload -- BUT NOT if the user is in recovery mode!
      if (remember === '0' && !isRecoveryUrl) {
        await supabase.auth.signOut();
        setUser(null);
        setLoading(false);
        return;
      }

      if (isRecoveryUrl) {
        localStorage.removeItem('fin_remember_me');
        setIsRecovery(true);
      }

      setUser(session.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        localStorage.removeItem('fin_remember_me');
      }
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, rememberMe: boolean) => {
    try {
      localStorage.setItem('fin_remember_me', rememberMe ? '1' : '0');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    loading,
    isRecovery,
    clearRecovery,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
