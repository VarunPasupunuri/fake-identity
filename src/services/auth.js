/**
 * Auth service. Real Firebase Auth when configured; a local demo login otherwise.
 * Roles: 'officer' | 'admin'. Role comes from the `app_role` custom claim if present,
 * else users/{uid}.role. (The `role` claim is reserved: Supabase third-party auth
 * expects it to be 'authenticated'.)
 */
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, isDemoMode, callFunction } from '../lib/firebase.js';
import { demoStore } from './demoStore.js';
import { setStorageTokenProvider } from './storage.js';

// Supabase Storage authenticates with the Firebase ID token (third-party auth).
if (!isDemoMode) setStorageTokenProvider(async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null));

/**
 * Local accounts used when no authentication backend is configured.
 *
 * Deliberately not people: an invented officer with an invented posting reads as
 * a real record of a real person, and this product must never put one on screen
 * that an operator could mistake for their own. These are roles, named as roles.
 */
export const LOCAL_ACCOUNTS = [
  { uid: 'local-officer', email: 'officer@identitysentinel.local', password: 'sentinel', displayName: 'Verification Officer', role: 'officer', checkpoint: '' },
  { uid: 'local-admin', email: 'admin@identitysentinel.local', password: 'sentinel', displayName: 'Administrator', role: 'admin', checkpoint: '' },
];



const DEMO_SESSION_KEY = 'session';

export function subscribeAuth(cb) {
  if (isDemoMode) {
    const uid = demoStore.get(DEMO_SESSION_KEY, 'current')?.uid;
    const u = LOCAL_ACCOUNTS.find((x) => x.uid === uid);
    cb(u ? publicUser(u) : null);
    const handler = () => { const id = demoStore.get(DEMO_SESSION_KEY, 'current')?.uid; const uu = LOCAL_ACCOUNTS.find((x) => x.uid === id); cb(uu ? publicUser(uu) : null); };
    window.addEventListener('demo-auth', handler);
    return () => window.removeEventListener('demo-auth', handler);
  }
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) return cb(null);
    try { cb(await buildProfile(fbUser)); } catch (e) { console.error('profile load failed', e); cb({ uid: fbUser.uid, email: fbUser.email, displayName: fbUser.email, role: 'officer' }); }
  });
}

async function buildProfile(fbUser) {
  const token = await fbUser.getIdTokenResult();
  let role = appRoleFromClaims(token.claims);
  let profile = {};
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) profile = snap.data();
  else await setDoc(ref, { email: fbUser.email, displayName: fbUser.displayName || fbUser.email, role: 'officer', createdAt: serverTimestamp() });
  role = role || profile.role || 'officer';
  return { uid: fbUser.uid, email: fbUser.email, displayName: profile.displayName || fbUser.displayName || fbUser.email, role, checkpoint: profile.checkpoint || null };
}

const publicUser = ({ password, ...u }) => u; // eslint-disable-line no-unused-vars

/** Read the application role from Firebase custom claims (legacy `role` values still honoured). */
export function appRoleFromClaims(claims = {}) {
  if (claims.app_role === 'admin' || claims.app_role === 'officer') return claims.app_role;
  if (claims.role === 'admin' || claims.role === 'officer') return claims.role;
  return null;
}

export async function signIn(email, password) {
  if (isDemoMode) {
    const u = LOCAL_ACCOUNTS.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
    if (!u) throw new Error('Invalid credentials. Use one of the demo accounts shown below.');
    demoStore.clear(DEMO_SESSION_KEY);
    demoStore.insert(DEMO_SESSION_KEY, { id: 'current', uid: u.uid });
    window.dispatchEvent(new Event('demo-auth'));
    return publicUser(u);
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return buildProfile(cred.user);
}

export async function signOut() {
  if (isDemoMode) {
    demoStore.clear(DEMO_SESSION_KEY);
    window.dispatchEvent(new Event('demo-auth'));
    return;
  }
  await fbSignOut(auth);
}

export async function listUsers() {
  if (isDemoMode) return LOCAL_ACCOUNTS.map(publicUser);
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/** Admin: change a user's role (and optionally checkpoint). Demo mode updates the in-memory list. */
export async function setUserRole(uid, role, checkpoint) {
  if (isDemoMode) {
    const u = LOCAL_ACCOUNTS.find((x) => x.uid === uid);
    if (u) { u.role = role; if (checkpoint) u.checkpoint = checkpoint; }
    return { ok: true };
  }
  return callFunction('setUserRole', { uid, role, checkpoint });
}
