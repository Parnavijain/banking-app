import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'banking.auth';

export function AuthProvider({ children }) {
  // Hydrate from localStorage synchronously so a page refresh doesn't
  // flicker the login page before we know the user is signed in.
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { token: null, user: null };
    } catch {
      return { token: null, user: null };
    }
  });
  const [loading, setLoading] = useState(false);

  // Persist any change back to localStorage.
  useEffect(() => {
    if (state.token) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  }, [state]);

  // On mount, if we have a token, verify it's still valid by hitting /me.
  // This catches server restarts (new JWT secret) and expired tokens.
  useEffect(() => {
    if (!state.token) return;
    api('/api/auth/me', { token: state.token }).catch(() => {
      setState({ token: null, user: null });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST', body: { email, password },
      });
      setState({ token: data.token, user: data.user });
    } finally { setLoading(false); }
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    setLoading(true);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST', body: { email, password, fullName },
      });
      setState({ token: data.token, user: data.user });
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(() => setState({ token: null, user: null }), []);

  return (
    <AuthContext.Provider value={{ ...state, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
