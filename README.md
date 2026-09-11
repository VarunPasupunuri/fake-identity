# Identity Sentinel — Intelligent Identity & Document Verification Platform

Smart India Hackathon **PS 26188** · Ministry of Home Affairs · Sashastra Seema Bal (SSB)

A responsive web app for verification officers: scan or upload **any official document** — from a birth certificate to a death certificate, passports, visas, national IDs, driving licences, voter IDs, academic marks memos, degree certificates, transcripts, employment and salary certificates, government certificates and licences, or an unrecognised official document — and get back the detected document type, extracted fields, document-specific validation, image-forensics evidence, QR/barcode analysis, a face comparison where a holder photograph applies, watchlist screening, identity correlation with prior cases, and a fused **risk score + analysis confidence** behind one of five assessments. Every screening is stored as an immutable audit record.

### What the assessment means

| Assessment | Meaning |
|---|---|
| **Likely authentic** | Document-level evidence is consistent and nothing contradicts it. Not a claim that the issuer recognises the document. |
| **Review required** | Suspicious or incomplete evidence needs officer inspection. |
| **Suspicious** | Strong evidence of invalidity, alteration or identity mismatch. |
| **Insufficient evidence** | Required evidence was unavailable, so no defensible automated assessment exists. Never treated as fraud. |
| **Verified** | Produced **only** when an authorised issuer source actually confirmed the record (see *Issuer verification*). |

Identity Sentinel performs document-level screening using extracted information, structural validation, image forensics, and available verification sources. **Official issuer verification requires an authorised external data source.** The platform never claims access to any government, police, immigration, university or employer database, and never reports a document as "100% original", "government verified" or "officially verified".

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind CSS 4, React Router 7, lucide-react |
| Backend | Firebase — Auth (email/password, officer/admin roles), Firestore (audit log), Cloud Functions v2 (Node 22) · **Supabase Storage** (private bucket for document/live images, free tier, no Firebase Blaze plan needed) |
| OCR | **Tesseract.js** in the browser (self-hosted worker/WASM/traineddata, works offline) · or Google **Cloud Vision** via the `ocrExtract` Cloud Function |
| Face verification | **face-api.js** (`@vladmandic/face-api`, SSD MobileNet v1 + 128-d descriptors) in the browser, self-hosted weights |
| Tampering | **Error Level Analysis** + **EXIF/XMP metadata** checks — in the browser (canvas + exifr) or in the `analyzeTampering` Cloud Function (sharp + exifr) |
| Document types | Declarative **profiles** (`src/modules/documents/profiles.js`): expected fields, validation rules, MRZ/QR/face applicability, issuer |
| QR / barcode | Browser **BarcodeDetector** where available, falling back to **jsQR** — entirely on device |
| Tests | Vitest for the pure logic (classification, extraction, profile rules, MRZ, validation, fusion, risk, ELA heuristics) |

## Quick start

```bash
npm install            # also copies OCR + face model assets into public/ (scripts/copy-assets.mjs)
cp .env.example .env   # leave the Firebase keys blank for demo mode
npm run dev            # http://localhost:5173
```

**Demo mode** (no Firebase config) gives you two local accounts, `officer@demo.gov` and `admin@demo.gov` (password `demo1234`), and persists screenings in `localStorage`. Real OCR, ELA, QR reading and face comparison still run in the browser. On the *Screen document* page you can toggle **Demonstration data**, pick any of the synthetic documents (passport → birth certificate → marks memo → experience certificate → unrecognised document) and a scenario (*genuine*, *altered*, *missing required fields*, *inconsistent dates*, *poor OCR quality*, *unreadable QR code*, *unknown document type*) to exercise the whole flow instantly. Every fixture is invented demo data (`src/modules/documents/fixtures.js`).

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
  modules/            ← screening modules (provider-agnostic contracts in types.js)
    registry.js       ← THE place providers are chosen (from VITE_*_PROVIDER); UI never imports a provider
    documents/        ← the universal document layer
      profiles.js     one declarative profile per document type (fields, rules, MRZ/QR/face applicability, issuer)
      registry.js     lookups, selector options, category resolution
      classify.js     document-type detection (weighted text signals + MRZ document code, with a confidence floor)
      fields.js       universal field catalogue (label, kind, printed labels)
      extract.js      profile-driven field extraction + generic date/identifier/organisation scanners
      validate.js     configurable rule engine (required, formats, dates, ranges, marks, QR consistency)
      fixtures.js     DEMO/SYNTHETIC text + QR fixtures for every category and failure scenario
    ocr/              mock | tesseract | cloud   + parse.js (travel-document text→fields parser)
    validation/       mrz.js (ICAO 9303 TD1/TD2/TD3 + check digits), rules.js, index.js (routes to the profile engine)
    tampering/        mock | local (canvas ELA + exifr) | cloud   + ela.js, metadata.js
    barcode/          local (BarcodeDetector → jsQR) | mock | off   + decode.js (payload classification, consistency)
    face/             mock | faceapi
    watchlist/        demo (synthetic test records) | api (authorised service placeholder → unavailable) | off
    identity/         historical identity correlation over prior screenings (pure)
    issuer/           unavailable (default) | synthetic (demo register) | external (authorised service placeholder)
    fusion/           evidence normalisation, correlations, risk + confidence, five-state assessment, chain, counterfactual
    risk/             legacy weighted score + factor breakdown (kept for older records)
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

### Watchlist screening (prototype)

Extracted identifiers (document number, name, date of birth, nationality) are screened by a `WatchlistProvider`. The prototype ships only a **synthetic demo list** (`src/modules/watchlist/demoWatchlist.js`: invented names, `ZZ…` document numbers, ICAO's fictional `UTO`/`XXX` codes). It is **not connected to any government, police, immigration or Interpol database** and never claims to be. Matching is conservative: a document-number match needs a corroborating attribute to count as `confirmed_match`; name-only similarity is at most a weak `possible_match` that asks for officer review. `api` is a placeholder for an authorised external service and reports `unavailable` until one is integrated; `off` disables the check. Unavailable results become zero-risk *unavailable* evidence in fusion.

### Supported document categories

| Category | Types |
|---|---|
| Travel | Passport, Visa, Permit / Pass |
| Identity | National ID, Driving Licence, Voter ID |
| Civil registration | Birth Certificate, Death Certificate |
| Academic | Marks Memo / Marksheet, Degree Certificate, Academic Transcript, Transfer / Migration Certificate |
| Employment | Employment / Experience Certificate, Salary Certificate / Pay Slip, Offer / Appointment Letter |
| Certificate | Official Certificate (government, professional, business, licence, NOC), Bank / Financial Document |
| Generic | Unknown / Generic Official Document — extraction, forensics and consistency checks without a type-specific rule set |

Certificates differ by jurisdiction and issuer, so a profile declares *configurable* expectations rather than assuming one universal layout. A document that matches no profile is screened as a generic official document and is **never** failed for being unrecognised.

### Adding a document type

1. Add a profile object to `src/modules/documents/profiles.js`: id, label, category, classifier signals, expected fields (with `required` / `pattern`), `subjectField`, `primaryIdentifier`, `mrz`, `face`, `barcode`, `issuer`, `rules`, `guidance`.
2. That is the whole change. Classification, extraction, validation, evidence fusion, risk, the results UI, storage and history pick it up automatically; only add a selector entry in `registry.js` if it deserves its own button.

### Screening flow

1. **Document** — choose **Auto-detect** (default), a specific type, or a category; scan with the camera (`getUserMedia`, live preview) or upload a file. The two paths are separate: *Scan with camera* opens the camera, *Upload file* opens the file picker.
2. **Live photo** — only when the document profile has a holder photograph; front camera via `getUserMedia` (switchable) or upload, and it may be skipped. For a certificate the step is skipped entirely and face comparison is reported as *not applicable*, never as a failure.
3. **Processing** — text recognition → classification + field extraction → integrity, QR/barcode, face, watchlist and identity correlation in parallel → validation → issuer verification → evidence fusion. Only the modules relevant to the detected profile run; each step shows live progress and timing.
4. **Assessment** — risk (0–100) and analysis confidence side by side, the document type with its classification confidence, a verification-signal checklist, supporting / conflicting / unavailable evidence, correlated signals, extracted fields relevant to that document type, validation checklist, integrity flags drawn on the document with an ELA heat-map, decoded QR content, identity correlations, evidence chain, counterfactual, **assessment limitations**, and the officer's **Approve / Review / Reject** decision with a reason.

### QR / barcode analysis

Codes are read on device (BarcodeDetector, else jsQR). A code on a document **proves nothing by itself**: the platform reports whether a code was found, whether it could be decoded, what it encodes, and whether that content agrees with the printed identifiers or name. An encoded identifier contradicting the printed one is a failing consistency check; an unusual link (plain HTTP, raw IP, punycode, shortener, credentials in the URL) is flagged. Links are never opened. Without an authorised verification endpoint the result is "QR detected and decoded", never "officially verified".

### Identity correlation

The identity module compares the extracted identity with the screening history the caller can already see. It reports *potential* correlations — repeated document, possible repeated identity, conflicting identity record, name resemblance — with the fields that agree and contradict. It never asserts that two records are the same person; the officer decides.

### Issuer verification

`IssuerVerificationProvider` makes the difference between document-level analysis and official confirmation explicit:

| Provider | Behaviour |
|---|---|
| `unavailable` (default) | Reports "official issuer verification was not performed — no authorised external data source is configured". |
| `synthetic` | **Demo only.** A clearly labelled invented register matching the demo fixtures, so the VERIFIED state can be demonstrated. Not a real issuer. |
| `external` | Placeholder for an authorised external issuer API. Until one is wired it reports `unavailable`; it never fabricates a verification. |

Only a provider that actually confirms a record can produce the **Verified** assessment. Absence from a register is reported as "no record found", explicitly **not** as proof of forgery.

### Risk score (0–100, higher = riskier)

| Source | Contribution |
|---|---|
| Validation failures | critical 25 · major 12 · minor/warning 4 (capped at 45) |
| Tampering | `tamperScore × 0.4` (≤ 40) + 8 per high-severity flag |
| Face | `(100 − confidence) × 0.35` (≤ 35) + 10 if below match threshold; 20 if a face is missing |
| Missing module | OCR failed 30 · tampering unavailable 15 · no live photo 20 |

`< 30` Low → *accept* · `30–59` Medium → *flag* · `≥ 60` High → *reject*. Weights live in `src/modules/risk/index.js`.

### Validation rules

**Travel / identity documents** (passport, visa, national ID, driving licence, permit) keep the original engine: required fields per type · document-number pattern · DOB plausibility · expiry (fail if passed, warn under 6 months) · visa *valid-from*, entries, stay duration · ISO-3 country codes · gender value · **MRZ check digits** (document number, DOB, expiry, optional data, composite) · **MRZ ↔ visual-zone consistency** · OCR confidence.

**Every other profile** runs the configurable rule engine in `documents/validate.js`: required fields · identifier patterns · date validity · expiry · cross-field date order (birth → registration → issue; birth → death; joining → leaving → issue) · not-in-the-future · plausible age (optionally evaluated at another date) · numeric ranges (percentage 0–100, CGPA 0–10) · **marks-table arithmetic** (subject marks against the printed total, percentage against the marks, marks within their maxima) · distinct-name checks · issuer presence · QR/barcode consistency · OCR confidence. Rules are declarative descriptors on the profile, so a new rule type is one interpreter function.

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
- **Document classification** — the keyword/MRZ rules in `documents/classify.js` return `{ type, confidence, candidates, basis }`. A layout or vision classifier can replace `classifyDocument` behind the same contract; the confidence floor that falls back to *generic official document* should stay.
- **Issuer verification** — implement `modules/issuer/external.js` against the authorised API (credentials held server-side, e.g. in a Cloud Function) and set `VITE_ISSUER_PROVIDER=external`. Nothing else changes; the VERIFIED assessment becomes reachable for real records.

## Limitations

- No connection to any government, police, immigration, university, employer or Interpol database exists, and none is simulated. Watchlist and issuer demo providers use invented records and label themselves synthetic.
- Classical image forensics (ELA + metadata) indicate *possible* manipulation; they cannot prove or exclude forgery with certainty. Wording throughout stays "possible manipulation detected" / "potential editing indicators".
- Certificate layouts vary by jurisdiction and issuer; profiles encode configurable expectations, not one universal format. A document that matches no profile is screened generically rather than rejected.
- A QR code or barcode on a document is not evidence of authenticity; only consistency with the printed data is assessed.
- Every assessment is advisory. The officer records the decision, and a decision that differs from the system assessment is stored as an override with a reason.

## Audit trail

Each `screenings/{id}` document stores officer id/name, checkpoint, timestamp, document type and category, the classification result (detected type, confidence, basis, whether the officer overrode it) and the type the officer requested, extracted fields, all validation checks, tampering flags (+ metadata summary and, when small enough, the ELA heat-map), QR/barcode result, face result, watchlist result, identity correlations, issuer verification result, the full evidence-fusion output (evidence, correlations, risk, confidence, assessment, chain, counterfactual), risk breakdown, provider versions, the Supabase object paths of the document and live images (`documentImagePath`, `liveImagePath`, `imageStorage`), and the officer's decision + note + decision time. Fields added by later versions are written as `null` on new records and simply absent on older ones — **no migration is performed and old records stay readable**; the results screen falls back to the legacy risk panel for records that pre-date evidence fusion. Security rules make records append-only from the client (only the decision fields can be updated, never deleted). The admin dashboard shows totals, flagged %, breakdowns by document type and checkpoint, and a searchable audit log; a Firestore trigger maintains `stats/summary` counters for large deployments.
