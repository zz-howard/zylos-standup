import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const body = await api('/api/auth/me');
      setMember(body.member || null);
      return body.member || null;
    } catch {
      setMember(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname.replace(/^\/standup/, '') || '/';
    if (path === '/login') {
      setLoading(false);
    } else {
      refresh();
    }
    const onUnauthorized = () => setMember(null);
    window.addEventListener('standup:unauthorized', onUnauthorized);
    return () => window.removeEventListener('standup:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async ({ teamId, name, password }) => {
    const body = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ team_id: Number(teamId), name, password }),
    });
    setMember(body.member || null);
    return body.member || null;
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setMember(null);
  }, []);

  const value = useMemo(() => ({ member, loading, login, logout, refresh }), [
    member,
    loading,
    login,
    logout,
    refresh,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
