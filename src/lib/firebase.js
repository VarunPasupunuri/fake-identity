/**
 * Firebase bootstrap. When VITE_FIREBASE_* is not set the app runs in DEMO MODE:
 * auth and persistence are simulated locally (see services/) so the screening
 * flow can be demonstrated without a Firebase project.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const isDemoMode = !isFirebaseConfigured;

let app = null, auth = null, db = null, storage = null, functions = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, 'asia-south1');
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  }
}

export { app, auth, db, storage, functions };

/** Call a callable Cloud Function and unwrap its data. */
export async function callFunction(name, payload) {
  if (!functions) throw new Error(`Cloud Function "${name}" unavailable: Firebase is not configured.`);
  const fn = httpsCallable(functions, name, { timeout: 120000 });
  const res = await fn(payload);
  return res.data;
}

export const CHECKPOINT_ID = env.VITE_CHECKPOINT_ID || 'CP-DEMO-01';
