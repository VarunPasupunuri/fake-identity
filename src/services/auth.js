/**
 * Auth service. Real Firebase Auth when configured; a local demo login otherwise.
 * Roles: 'officer' | 'admin'. Role comes from a custom claim if present, else users/{uid}.role.
 */
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, isDemoMode, callFunction } from '../lib/firebase.js';
import { demoStore } from './demoStore.js';

export const DEMO_USERS = [
  { uid: 'demo-officer', email: 'officer@demo.gov', password: 'demo1234', displayName: 'Officer R. Singh', role: 'officer', checkpoint: 'CP-DEMO-01' },
  { uid: 'demo-admin', email: 'admin@demo.gov', password: 'demo1234', displayName: 'Admin S. Iyer', role: 'admin', checkpoint: 'HQ' },
];

const DEMO_SESSION_KEY = 'session';

export function subscribeAuth(cb) {
  if (isDemoMode) {
    const uid = demoStore.get(DEMO_SESSION_KEY, 'current')?.uid;
    const u = DEMO_USERS.find((x) => x.uid === uid);
    cb(u ? publicUser(u) : null);
    const handler = () => { const id = demoStore.get(DEMO_SESSION_KEY, 'current')?.uid; const uu = DEMO_USERS.find((x) => x.uid === id); cb(uu ? publicUser(uu) : null); };
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
  let role = token.claims.role || null;
  let profile = {};
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) profile = snap.data();
  else await setDoc(ref, { email: fbUser.email, displayName: fbUser.displayName || fbUser.email, role: 'officer', createdAt: serverTimestamp() });
  role = role || profile.role || 'officer';
  return { uid: fbUser.uid, email: fbUser.email, displayName: profile.displayName || fbUser.displayName || fbUser.email, role, checkpoint: profile.checkpoint || null };
}

const publicUser = ({ password, ...u }) => u; // eslint-disable-line no-unused-vars

export async function signIn(email, password) {
  if (isDemoMode) {
    const u = DEMO_USERS.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
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
  if (isDemoMode) return DEMO_USERS.map(publicUser);
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/** Admin: change a user's role (and optionally checkpoint). Demo mode updates the in-memory list. */
export async function setUserRole(uid, role, checkpoint) {
  if (isDemoMode) {
    const u = DEMO_USERS.find((x) => x.uid === uid);
    if (u) { u.role = role; if (checkpoint) u.checkpoint = checkpoint; }
    return { ok: true };
  }
  return callFunction('setUserRole', { uid, role, checkpoint });
}
