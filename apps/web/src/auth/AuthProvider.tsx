import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    logout: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

  useEffect(() => {
        // 1. Retrieve existing session on mount
                supabase.auth.getSession().then(({ data: { session: s } }) => {
                        setSession(s);
                        setUser(s?.user ?? null);
                        setLoading(false);
                });

                // 2. Subscribe to auth state changes
                const {
                        data: { subscription },
                } = supabase.auth.onAuthStateChange((_event, s) => {
                        setSession(s);
                        setUser(s?.user ?? null);
                        setLoading(false);
                });

                return () => {
                        subscription.unsubscribe();
                };
  }, []);

  const login = useCallback(
        async (email: string, password: string) => {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                return { error };
        },
        []
      );

  const logout = useCallback(async () => {
        await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = { user, session, loading, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (ctx === undefined) {
          throw new Error('useAuthContext must be used within an AuthProvider');
    }
    return ctx;
}
