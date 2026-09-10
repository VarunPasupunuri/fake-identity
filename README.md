# BorderScreen — AI-Based Fake Identity & Document Screening System

Smart India Hackathon **PS 26188** · Ministry of Home Affairs · Sashastra Seema Bal (SSB)

A responsive web app for border checkpoint officers: scan a passport / visa / national ID / driving licence / permit, capture a live photo, and get back extracted data, validation results, tampering evidence, a face-match score and a single **risk score** to support a fast **Accept / Flag / Reject** decision. Every screening is stored as an immutable audit record.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind CSS 4, React Router 7, lucide-react |
| Backend | Firebase — Auth (email/password, officer/admin roles), Firestore (audit log), Cloud Functions v2 (Node 22) · **Supabase Storage** (private bucket for document/live images, free tier, no Firebase Blaze plan needed) |
| OCR | **Tesseract.js** in the browser (self-hosted worker/WASM/traineddata, works offline) · or Google **Cloud Vision** via the `ocrExtract` Cloud Function |
| Face verification | **face-api.js** (`@vladmandic/face-api`, SSD MobileNet v1 + 128-d descriptors) in the browser, self-hosted weights |
| Tampering | **Error Level Analysis** + **EXIF/XMP metadata** checks — in the browser (canvas + exifr) or in the `analyzeTampering` Cloud Function (sharp + exifr) |
| Tests | Vitest for the pure logic (MRZ, validation, parsing, risk, ELA heuristics) |

## Quick start

```bash
npm install            # also copies OCR + face model assets into public/ (scripts/copy-assets.mjs)
cp .env.example .env   # leave the Firebase keys blank for demo mode
npm run dev            # http://localhost:5173
```

**Demo mode** (no Firebase config) gives you two local accounts, `officer@demo.gov` and `admin@demo.gov` (password `demo1234`), and persists screenings in `localStorage`. Real OCR, ELA and face verification still run in the browser. On the *New screening* page you can also toggle **Mock outputs** and choose a *genuine* or *forged* scenario to demo the full flow instantly.

```bash
npm test               # unit tests
npm run build          # production build → dist/
```

## UI highlights

- **Responsive console** — collapsible sidebar on desktop, bottom navigation with a centre *Scan* action on phones/tablets, sticky decision bar on small screens, safe-area aware.
- **Light / dark / system theme**, persisted per device; the palette uses semantic tokens so every screen is legible in both modes.
- **Guided capture** — document-type cards with per-type tips, framing guide, and on-device quality checks (blur, exposure, contrast) before processing; face oval guide, timer and camera switching for the live photo.
- **Processing screen** — per-module progress, timings, live log and a scan animation over the document.
- **Results** — risk gauge with factor breakdown, tabbed panels on mobile, failed fields highlighted, tampering regions drawn over the document with an ELA heat-map toggle, face boxes, keyboard shortcuts (`A` / `F` / `R`) and a confirm step for *Reject*.
- **History** — search, document/decision/risk filters, date range presets, table or card view, pagination, CSV export.
- **Screening report** — timeline, copy link, JSON download, print-ready layout.
- **Admin** — 14-day decision trend, risk distribution, breakdowns by document type and checkpoint, officer activity table, searchable audit log, user role management.
- **Settings** — theme, checkpoint id, module provider selection at runtime, capture-guide and auto-run toggles, on-device asset health check, keyboard shortcut reference.
- **PWA manifest** so the console can be installed to a tablet home screen; toasts, skeleton loaders, error boundary, offline indicator.

Keyboard: `N` new screening · `G H` home · `G Y` history · `G A` admin · `G ,` settings.

## Firebase + Supabase setup (production)

Authentication and the audit log stay on Firebase (free Spark plan). Document and live-photo images go to a **private Supabase Storage bucket**, which keeps Firebase Storage — and therefore the Blaze plan — out of the picture.

### How the three pieces work together

```
officer's browser
 ├─ Firebase Auth      → signs in, issues a Firebase ID token (JWT)
 ├─ Firestore          → screenings/{id} holds all module outputs + decision + image PATHS
 └─ Supabase Storage   → private bucket "fake"
        ▲  every request carries the *Firebase* ID token (Supabase "Third-Party Auth")
        └─ RLS policies on storage.objects check auth.jwt()->>'sub' (Firebase uid)
           and auth.jwt()->>'app_role' (admin), so officers can only write/read
           screenings/{their uid}/… and admins can read everything. Viewing uses
           short-lived signed URLs; nothing is public.
```

Firestore never stores image bytes or URLs in production — only object paths such as `screenings/{officerUid}/{screeningId}/document-k3j9x2ab.jpg`. Filenames contain no personal data. `src/services/storage.js` is the only file that talks to Supabase; the rest of the app calls `uploadDocument`, `getDocumentUrl(s)` and `deleteDocument`.

### 1. Firebase (free plan)

1. Create a Firebase project. Enable **Authentication → Sign-in method → Email/Password** and create **Firestore** (production mode).
2. Project settings → General → *Your apps* → add a **Web app** and copy the config into `.env` (`VITE_FIREBASE_*`). Set the project id in `.firebaserc`.
3. Create officer accounts under Authentication → Users.
4. Give every user the custom claims Supabase and the app expect (works without Cloud Functions):
   ```bash
   # service account: Project settings → Service accounts → Generate new private key (keep it outside the repo)
   GOOGLE_APPLICATION_CREDENTIALS=~/keys/firebase-sa.json node scripts/set-user-claims.mjs officer@example.gov officer
   GOOGLE_APPLICATION_CREDENTIALS=~/keys/firebase-sa.json node scripts/set-user-claims.mjs admin@example.gov admin
   ```
   This sets `role: "authenticated"` (required by Supabase third-party auth) and `app_role: officer|admin`, and mirrors the role to `users/{uid}`. Users must sign out and in again to pick up new claims.
5. Deploy rules and hosting:
   ```bash
   npm i -g firebase-tools && firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   npm run build && firebase deploy --only hosting
   ```
   Cloud Functions (`functions/`) are optional — they power the *cloud* OCR/tampering providers and the callable role manager, and they **do** require the Blaze plan. Everything else runs without them.

### 2. Supabase (free plan)

1. Go to <https://supabase.com>, sign in, **New project** (any region; the free tier includes 1 GB of Storage).
2. **Register Firebase as an auth provider**: Authentication → *Sign In / Providers* → **Third-Party Auth** → *Add provider* → **Firebase** → enter your **Firebase project ID** → save. Supabase will now verify Firebase ID tokens and run those requests as the `authenticated` role.
3. **Create the private bucket and policies**: SQL Editor → *New query* → paste [`supabase/storage-policies.sql`](supabase/storage-policies.sql) → *Run*. It creates the bucket `fake` (the name is set once in `public.screening_bucket()` at the top of the file) with `public = false`, a 15 MB / image-only limit, and four RLS policies (officer upload own folder, officer read own folder, admin read all, admin delete). You can confirm under Storage → *fake* → the bucket shows **Private**.
   (If you prefer the UI: Storage → *New bucket* → name `fake`, **Public bucket OFF** — then still run the SQL for the policies.)
   Using a different bucket name? Edit the single `public.screening_bucket()` line at the top of the SQL file to return that name, and set `VITE_SUPABASE_STORAGE_BUCKET` to the same value.
4. **Collect credentials**: Project Settings → **API** → copy *Project URL* and the **anon public** key into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...          # anon key only — NEVER the service_role key
   VITE_SUPABASE_STORAGE_BUCKET=fake
   ```
   The anon key is a public identifier; it grants nothing by itself because the bucket is private and every policy requires a valid Firebase token.

### 3. Run and test locally

```bash
cp .env.example .env    # fill VITE_FIREBASE_* and VITE_SUPABASE_*
npm install
npm run dev             # http://localhost:5173 (camera works on localhost)
```

- Sign in with a Firebase user that has the claims from step 1.4, run a screening, and open **Settings** — *Image storage* should read `Supabase private bucket "fake" (signed URLs)`.
- In Supabase → Storage → *fake* you should see `screenings/<firebase uid>/<screening id>/document-….jpg` (and `live-….jpg`).
- Open the screening from **History**: the images are fetched with signed URLs that expire after 1 hour. Copy one of those URLs into a private window: it works until expiry; the plain object URL without a token returns `400/403`.
- Sign in as a second officer: their History cannot show the first officer's images (the signed-URL request is denied by RLS and the UI shows the *No image* placeholder). An `app_role: admin` user sees everything.
- If `VITE_SUPABASE_*` is blank while Firebase is configured, screenings still save: images are stored inline in the Firestore record (compact JPEG data URLs) and the officer gets a warning toast. Use this only for testing.

### Demo mode

Leave all `VITE_FIREBASE_*` and `VITE_SUPABASE_*` values blank: the app starts with the two demo accounts, keeps screenings in `localStorage`, and never loads the Supabase SDK.

## App structure

```
src/
  modules/            ← the four screening modules + risk scoring (provider-agnostic contracts in types.js)
    registry.js       ← THE place providers are chosen (from VITE_*_PROVIDER); UI never imports a provider
    ocr/              mock | tesseract | cloud   + parse.js (shared text→fields parser)
    validation/       mrz.js (ICAO 9303 TD1/TD2/TD3 + check digits), rules.js, index.js
    tampering/        mock | local (canvas ELA + exifr) | cloud   + ela.js, metadata.js
    face/             mock | faceapi
    risk/             weighted score + factor breakdown
  hooks/useScreeningPipeline.js   ← orchestrates modules, exposes per-step progress
  services/           auth.js, screenings.js (Firestore with demo-mode fallback), storage.js (Supabase Storage: upload / signed URLs / delete), demoStore.js
  hooks/useScreeningImages.js    ← resolves stored image paths to signed URLs (or inline data URLs) for pages
  pages/              Login, Home, Screening (4-step wizard), History, ScreeningDetail, Admin
  components/         layout (responsive shell: sidebar / bottom nav), ui, screening panels
functions/            ocrExtract, analyzeTampering, setUserRole, onScreeningCreated  (+ ela.js) — optional, Blaze only
scripts/set-user-claims.mjs   set Firebase custom claims (role=authenticated, app_role) without Cloud Functions
supabase/storage-policies.sql private bucket + RLS policies for screenings/{officerUid}/{screeningId}/…
firestore.rules       officers append-only to their own screenings; admins read everything; no deletes
```

### Screening flow

1. **Document** — choose type, scan with the rear camera (`capture="environment"`) or upload.
2. **Live photo** — front camera via `getUserMedia` (switchable), or upload; may be skipped (penalised in the risk score).
3. **Processing** — OCR → validation, then tampering + face in parallel, then risk; each step shows live progress and timing.
4. **Results** — risk gauge with factor breakdown, extracted fields (MRZ shown when present, failed fields highlighted), validation checklist, tampering flags drawn as boxes on the document with an ELA heat-map toggle and metadata table, face comparison with detected boxes, and **Accept / Flag / Reject** buttons with an optional officer note.

### Risk score (0–100, higher = riskier)

| Source | Contribution |
|---|---|
| Validation failures | critical 25 · major 12 · minor/warning 4 (capped at 45) |
| Tampering | `tamperScore × 0.4` (≤ 40) + 8 per high-severity flag |
| Face | `(100 − confidence) × 0.35` (≤ 35) + 10 if below match threshold; 20 if a face is missing |
| Missing module | OCR failed 30 · tampering unavailable 15 · no live photo 20 |

`< 30` Low → *accept* · `30–59` Medium → *flag* · `≥ 60` High → *reject*. Weights live in `src/modules/risk/index.js`.

### Validation rules

Required fields per document type · document-number pattern · DOB plausibility · expiry (fail if passed, warn under 6 months) · visa *valid-from*, entries, stay duration · ISO-3 country codes · gender value · **MRZ check digits** (document number, DOB, expiry, optional data, composite) · **MRZ ↔ visual-zone consistency** · OCR confidence.

## Swapping a module for a stronger model

Every module is an async function with a fixed input/output contract (`src/modules/types.js`). To replace one:

1. Add a file under the module folder that exports the same function (`extract`, `analyse`, or `verify`) returning the documented shape.
2. Register it in that module's `index.js` map and pick it with the matching `VITE_*_PROVIDER` value.

Nothing in `hooks/`, `pages/` or `components/` changes.

Where a trained model would replace the MVP heuristics:

- **Tampering** — `tampering/ela.js` and `functions/ela.js` implement ELA + grid outlier detection + metadata checks. A fuller build swaps `analyseImage` for a forgery-localisation network (e.g. ManTra-Net / CAT-Net / a CNN over ELA + noise residuals) trained on genuine vs. forged ID documents, plus a dedicated stamp/seal template matcher and copy-move detection. The `{ score, flags[region], evidence }` shape stays the same.
- **Face** — replace face-api.js descriptors with an ArcFace/InsightFace service (or a vendor API) behind a Cloud Function, and add liveness/anti-spoofing on the live capture.
- **OCR** — Cloud Vision is already wired; a document-specific layout model (field-level bounding boxes, per-field confidence) would improve the `vizFields` used for MRZ ↔ visual-zone cross-checks.
- **Risk** — the weighted sum can be replaced by a calibrated classifier trained on officer decisions from the audit log; the factor breakdown must still be produced for explainability.

## Audit trail

Each `screenings/{id}` document stores officer id/name, checkpoint, timestamp, document type, extracted fields, all validation checks, tampering flags (+ metadata summary and, when small enough, the ELA heat-map), face result, risk breakdown, provider versions, the Supabase object paths of the document and live images (`documentImagePath`, `liveImagePath`, `imageStorage`), and the officer's decision + note + decision time. Security rules make records append-only from the client (only the decision fields can be updated, never deleted). The admin dashboard shows totals, flagged %, breakdowns by document type and checkpoint, and a searchable audit log; a Firestore trigger maintains `stats/summary` counters for large deployments.
