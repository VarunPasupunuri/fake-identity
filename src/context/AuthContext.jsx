import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeAuth, signIn as doSignIn, signOut as doSignOut } from '../services/auth.js';
import { seedDemoData } from '../services/screenings.js';
import { isDemoMode } from '../lib/firebase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    let unsub = null;
    const p = subscribeAuth((u) => {
      setUser(u);
      if (u && isDemoMode) seedDemoData(u);
    });
    if (typeof p === 'function') unsub = p; else if (p?.then) p.then((fn) => { unsub = fn; });
    return () => unsub?.();
  }, []);

  const value = {
    user: user || null,
    loading: user === undefined,
    isAdmin: user?.role === 'admin',
    signIn: doSignIn,
    signOut: doSignOut,
    isDemoMode,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
