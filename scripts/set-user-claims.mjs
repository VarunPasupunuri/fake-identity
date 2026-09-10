#!/usr/bin/env node
/**
 * Set Firebase custom claims for a user WITHOUT Cloud Functions (works on the free Spark plan).
 *
 *   role      = 'authenticated'   → required by Supabase third-party auth
 *   app_role  = 'officer'|'admin' → Identity Sentinel application role (also mirrored to users/{uid}.role)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   node scripts/set-user-claims.mjs <email-or-uid> <officer|admin>
 *
 * Service account JSON: Firebase Console > Project settings > Service accounts > Generate new private key.
 * Keep that file OUT of the repository. Users must sign out/in (or wait ≤1 h) for new claims to apply.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// firebase-admin is installed under functions/ — reuse it so the root app has no server-side deps.
const require = createRequire(join(here, '..', 'functions', 'package.json'));

const [target, appRole] = process.argv.slice(2);
if (!target || !['officer', 'admin'].includes(appRole)) {
  console.error('Usage: node scripts/set-user-claims.mjs <email-or-uid> <officer|admin>');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the path of your Firebase service-account JSON.');
  process.exit(1);
}

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = target.includes('@') ? await auth.getUserByEmail(target) : await auth.getUser(target);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role: 'authenticated', app_role: appRole });
await getFirestore().doc(`users/${user.uid}`).set({ role: appRole, email: user.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`✔ ${user.email || user.uid}: claims { role: 'authenticated', app_role: '${appRole}' } and users/${user.uid}.role = '${appRole}'`);
