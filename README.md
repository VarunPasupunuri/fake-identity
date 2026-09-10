# BorderScreen — AI-Based Fake Identity & Document Screening System

Smart India Hackathon **PS 26188** · Ministry of Home Affairs · Sashastra Seema Bal (SSB)

A responsive web app for border checkpoint officers: scan a passport / visa / national ID / driving licence / permit, capture a live photo, and get back extracted data, validation results, tampering evidence, a face-match score and a single **risk score** to support a fast **Accept / Flag / Reject** decision. Every screening is stored as an immutable audit record.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind CSS 4, React Router 7, lucide-react |
| Backend | Firebase — Auth (email/password, officer/admin roles), Firestore (audit log), Storage (images), Cloud Functions v2 (Node 20) |
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

**Demo mode** (no Firebase config) gives you two local accounts, `officer@demo.gov` and `admin@demo.gov` (password `demo1234`), and persists screenings in `localStorage`. Real OCR, ELA and face verification still run in the browser. On the *New screening* page you can also toggle **Use mock module outputs** and choose a *genuine* or *forged* scenario to demo the full flow instantly.

```bash
npm test               # unit tests
npm run build          # production build → dist/
```

## Firebase setup (production)

1. Create a Firebase project, enable **Authentication → Email/Password**, **Firestore**, **Storage**, and (for the cloud OCR provider) the **Cloud Vision API** in GCP.
2. Fill `VITE_FIREBASE_*` in `.env` and set the project id in `.firebaserc`.
3. Deploy rules and functions:
   ```bash
   npm i -g firebase-tools && firebase login
   (cd functions && npm install)
   firebase deploy --only firestore:rules,storage,functions
   npm run build && firebase deploy --only hosting
   ```
4. Create officer accounts in Firebase Auth. Each user gets a `users/{uid}` profile with `role: 'officer'` on first sign-in. Promote an admin once by setting `role: 'admin'` on their profile in the console (or call the `setUserRole` function from an existing admin).
5. Optional: set `VITE_OCR_PROVIDER=cloud` and/or `VITE_TAMPER_PROVIDER=cloud` to route those modules through the Cloud Functions. `npm run emulators` runs the whole stack locally with `VITE_USE_EMULATORS=true`.

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
  services/           auth.js, screenings.js (Firestore/Storage with demo-mode fallback), demoStore.js
  pages/              Login, Home, Screening (4-step wizard), History, ScreeningDetail, Admin
  components/         layout (responsive shell: sidebar / bottom nav), ui, screening panels
functions/            ocrExtract, analyzeTampering, setUserRole, onScreeningCreated  (+ ela.js)
firestore.rules       officers append-only to their own screenings; admins read everything; no deletes
storage.rules         images under screenings/{uid}/{screeningId}/ readable by owner + admins
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

Each `screenings/{id}` document stores officer id/name, checkpoint, timestamp, document type, extracted fields, all validation checks, tampering flags (+ metadata summary and, when small enough, the ELA heat-map), face result, risk breakdown, provider versions, and the officer's decision + note + decision time. Security rules make records append-only from the client (only the decision fields can be updated, never deleted). The admin dashboard shows totals, flagged %, breakdowns by document type and checkpoint, and a searchable audit log; a Firestore trigger maintains `stats/summary` counters for large deployments.
