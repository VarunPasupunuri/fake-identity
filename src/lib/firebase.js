/**
 * Firebase bootstrap (Auth, Firestore, Functions). Document images are NOT kept
 * in Firebase — see services/storage.js (Supabase Storage). When VITE_FIREBASE_*
 * is not set the app runs in DEMO MODE: auth and persistence are simulated
 * locally (see services/) so the screening flow can be demonstrated without a
 * Firebase project.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const isDemoMode = !isFirebaseConfigured;

let app = null, auth = null, db = null, functions = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, 'asia-south1');
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  }
}

export { app, auth, db, functions };

/** Call a callable Cloud Function and unwrap its data. */
export async function callFunction(name, payload) {
  if (!functions) throw new Error(`Cloud Function "${name}" unavailable: Firebase is not configured.`);
  const fn = httpsCallable(functions, name, { timeout: 120000 });
  const res = await fn(payload);
  return res.data;
}

export const CHECKPOINT_ID = env.VITE_CHECKPOINT_ID || 'CP-DEMO-01';
