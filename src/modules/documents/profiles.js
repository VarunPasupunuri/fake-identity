/**
 * DOCUMENT PROFILES — the extensible document-type registry.
 *
 * A profile declares everything the platform needs to screen one kind of
 * document; nothing document-specific lives in the UI or the pipeline.
 * Adding a document type = adding one profile object here (see docs/README).
 *
 * @typedef {Object} DocumentProfile
 * @property {string} id                       stable identifier stored on records
 * @property {string} label                    display name
 * @property {string} category                 travel | identity | civil | academic | employment | certificate | generic
 * @property {string[]} aliases                other names the classifier should recognise
 * @property {DocumentSignal[]} signals        weighted text signals used by the classifier
 *
 * @typedef {Object} DocumentSignal
 * @property {RegExp} [re]        pattern matched against the normalised text
 * @property {RegExp[]} [all]     several patterns that must ALL be present (only the combination is meaningful)
 * @property {RegExp} [line]      pattern that must match within a single line (layout clue)
 * @property {string} [phrase]    phrase matched tolerantly, so OCR damage and line breaks do not lose a heading
 * @property {string[]} [phrases] spelling variants of ONE heading; any of them fires the signal exactly once
 * @property {number} [edits]     edit budget for `phrase` (default 1; words under 5 characters must match exactly)
 * @property {RegExp} [unless]    suppresses the signal when this also matches (e.g. "PASSPORT NO." on a visa page)
 * @property {'flat'|'raw'} [on]  which prepared view to match: collapsed text (default) or the original characters
 * @property {number} weight      contribution to the type's score
 * @property {'strong'|'medium'|'weak'} [tier]   how characteristic the clue is; weak clues are capped and can
 *                                never classify a document on their own (see classify.js)
 * @property {string} label       human-readable description shown as detection evidence — never a raw pattern
 * @property {{ key: string, required?: boolean, pattern?: RegExp, hint?: string }[]} fields
 *                                             expected fields (required ones raise a failing check when absent)
 * @property {string} subjectField             field that names the document's subject (mapped to fullName)
 * @property {string} primaryIdentifier        field used as the document number for history / watchlist
 * @property {boolean} mrz                     the document carries a machine readable zone
 * @property {'required'|'optional'|'not_applicable'} face   whether a live-face comparison applies
 * @property {boolean} barcode                 a QR / barcode is expected or common
 * @property {{ label: string, verification: 'unavailable'|'provider' }} issuer
 * @property {Array} rules                     document-specific consistency rules (see validate.js)
 * @property {string} guidance                 capture hint shown to the officer
 * @property {number} [aspect]                 width/height of the physical document, for the (weak) geometry check
 * @property {number} [generality]             <1 for catch-all profiles so a specific type wins a close race
 * @property {boolean} [legacy]                validated by the original passport/visa engine
 */

// Rule helpers are plain descriptors interpreted by validate.js so profiles stay declarative.
const dateOrder = (earlier, later, opts = {}) => ({ type: 'date_order', earlier, later, ...opts });
const notFuture = (field, opts = {}) => ({ type: 'not_future', field, ...opts });
const plausibleAge = (field, opts = {}) => ({ type: 'plausible_age', field, ...opts });
const numericRange = (field, min, max, opts = {}) => ({ type: 'numeric_range', field, min, max, ...opts });
const marksConsistent = () => ({ type: 'marks_consistent' });
const nameNotSame = (a, b, opts = {}) => ({ type: 'names_differ', a, b, ...opts });

const ACADEMIC_COMMON = [
  { key: 'studentName', required: true },
  { key: 'rollNumber', required: true, pattern: /^[A-Z0-9/-]{4,20}$/ },
  { key: 'institution' },
  { key: 'university' },
  { key: 'course' },
  { key: 'branch' },
  { key: 'academicYear' },
  { key: 'dateOfIssue' },
  { key: 'certificateNumber', pattern: /^[A-Z0-9/-]{4,24}$/ },
  { key: 'dateOfBirth' },
  { key: 'fatherName' },
];

/** @type {DocumentProfile[]} */
export const PROFILES = [
  // ------------------------------------------------------------------ travel / identity (legacy engine)
  {
    id: 'passport', label: 'Passport', category: 'travel', legacy: true,
    aliases: ['travel document'],
    signals: [
      { phrase: 'PASSPORT', weight: 0.45, tier: 'strong', label: 'a passport heading' },
      { re: /\bP<[A-Z]{3}/, on: 'raw', weight: 0.5, tier: 'strong', label: 'a TD3 passport machine readable zone' },
      { re: /\bPASSPORT (?:NO|NUMBER)\b/, unless: /\bVISA\b/, weight: 0.2, tier: 'medium', label: 'a passport number field' },
      { re: /\bTYPE P\b|\bCODE P\b|\bCOUNTRY CODE\b/, weight: 0.15, tier: 'medium', label: 'a document-type or country-code line' },
      { all: [/\bSURNAME\b/, /\bGIVEN NAMES?\b/], weight: 0.15, tier: 'medium', label: 'separate surname and given-names fields' },
      { re: /\bTRAVEL DOCUMENT\b/, weight: 0.15, tier: 'medium', label: 'the words "travel document"' },
      { re: /\bNATIONALITY\b/, weight: 0.12, tier: 'medium', label: 'a nationality field' },
      { all: [/\bDATE OF BIRTH\b|\bDOB\b/, /\bDATE OF EXPIRY\b|\bDATE OF ISSUE\b/], weight: 0.12, tier: 'medium', label: 'a date of birth alongside issue or expiry dates' },
      { re: /\bPLACE OF (?:BIRTH|ISSUE)\b/, weight: 0.1, tier: 'medium', label: 'a place of birth or place of issue field' },
      { re: /\b(?:REPUBLIC|KINGDOM|UNITED STATES|GOVERNMENT) OF\b/, weight: 0.05, tier: 'weak', label: 'an issuing state line' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'nationality', required: true }, { key: 'dateOfBirth', required: true }, { key: 'expiryDate', required: true }, { key: 'gender', required: true }, { key: 'surname' }, { key: 'givenNames' }, { key: 'issuingCountry' }, { key: 'placeOfBirth' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: true, face: 'required', barcode: false, aspect: 1.42,
    issuer: { label: 'Passport issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Open to the photo page. Both MRZ lines must be fully visible.',
  },
  {
    id: 'visa', label: 'Visa', category: 'travel', legacy: true,
    aliases: ['entry visa', 'visa sticker'],
    signals: [
      { phrase: 'VISA', weight: 0.45, tier: 'strong', label: 'a visa heading' },
      { re: /\bV<[A-Z]{3}/, on: 'raw', weight: 0.45, tier: 'strong', label: 'a visa machine readable zone' },
      { re: /\bVISA (?:NO|NUMBER|TYPE|CATEGORY)\b/, weight: 0.2, tier: 'medium', label: 'a visa number or category field' },
      { re: /\bENTRIES\b|\b(?:SINGLE|MULTIPLE|DOUBLE) ENTRY\b/, weight: 0.18, tier: 'medium', label: 'an entries field' },
      { re: /\b(?:DURATION|PERIOD|LENGTH) OF STAY\b/, weight: 0.18, tier: 'medium', label: 'a duration-of-stay field' },
      { re: /\b(?:BUREAU OF IMMIGRATION|IMMIGRATION (?:OFFICE|AUTHORITY)|CONSULATE|EMBASSY|HIGH COMMISSION)\b/, weight: 0.15, tier: 'medium', label: 'a visa issuing authority' },
      { all: [/\bVALID FROM\b/, /\bVALID (?:UNTIL|TILL|TO)\b/], weight: 0.15, tier: 'medium', label: 'a valid-from and valid-until pair' },
      { re: /\b(?:TOURIST|BUSINESS|STUDENT|EMPLOYMENT|TRANSIT|MEDICAL|CONFERENCE)\b/, weight: 0.12, tier: 'medium', label: 'a visa category such as tourist or business' },
      { re: /\bPASSPORT (?:NO|NUMBER)\b/, weight: 0.12, tier: 'medium', label: 'a reference to the holder passport number' },
      { re: /\bIMMIGRATION\b/, weight: 0.05, tier: 'weak', label: 'immigration wording' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'visaNumber', required: true }, { key: 'nationality', required: true }, { key: 'dateOfBirth', required: true }, { key: 'validUntil', required: true }, { key: 'visaType' }, { key: 'entries' }, { key: 'validFrom' }, { key: 'stayDuration' }],
    subjectField: 'fullName', primaryIdentifier: 'visaNumber', mrz: true, face: 'required', barcode: false,
    issuer: { label: 'Visa issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Include the visa sticker and its MRZ if present.',
  },
  {
    id: 'national_id', label: 'National ID', category: 'identity', legacy: true,
    aliases: ['identity card', 'id card', 'citizenship card', 'aadhaar', 'unique identification'],
    signals: [
      { phrase: 'UNIQUE IDENTIFICATION AUTHORITY OF INDIA', weight: 0.5, tier: 'strong', label: 'the Unique Identification Authority of India' },
      { re: /\bUIDAI\b/, weight: 0.5, tier: 'strong', label: 'the UIDAI mark' },
      { phrase: 'IDENTITY CARD', weight: 0.45, tier: 'strong', label: 'an identity card heading' },
      { phrase: 'AADHAAR', weight: 0.4, tier: 'strong', label: 'the word "Aadhaar"' },
      { re: /\b\d{4}[ -]\d{4}[ -]\d{4}\b/, weight: 0.35, tier: 'strong', label: 'a 12-digit Aadhaar-style number' },
      { re: /^I[<D][A-Z]{3}[A-Z0-9<]{8,}/m, on: 'raw', weight: 0.25, tier: 'medium', label: 'an ID-card machine readable zone' },
      { re: /\b(?:ID|IDENTITY|ENROL?LMENT) (?:NO|NUMBER)\b/, weight: 0.18, tier: 'medium', label: 'an identity number field' },
      { all: [/\bDOB\b|\bDATE OF BIRTH\b|\bYEAR OF BIRTH\b/, /\bMALE\b|\bFEMALE\b|\bGENDER\b|\bSEX\b/], weight: 0.15, tier: 'medium', label: 'a date of birth alongside a gender field' },
      { re: /\bVID\b[ :-]*\d/, weight: 0.15, tier: 'medium', label: 'a virtual ID (VID) field' },
      { re: /\bGOVERNMENT OF INDIA\b|\bGOVT OF INDIA\b/, weight: 0.12, tier: 'medium', label: 'a Government of India line' },
      { re: /\bCITIZEN(?:SHIP)?\b/, weight: 0.05, tier: 'weak', label: 'citizenship wording' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'dateOfBirth', required: true }, { key: 'gender' }, { key: 'nationality' }, { key: 'address' }, { key: 'expiryDate' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: true, face: 'required', barcode: true, aspect: 1.585,
    issuer: { label: 'National identity authority', verification: 'unavailable' }, rules: [],
    guidance: 'Front side with photo. Flatten the card to avoid glare.',
  },
  {
    id: 'driving_license', label: 'Driving Licence', category: 'identity', legacy: true,
    aliases: ['driving license', 'driver licence', 'dl'],
    signals: [
      { phrases: ['DRIVING LICENCE', 'DRIVING LICENSE'], weight: 0.5, tier: 'strong', label: 'a driving licence heading' },
      { phrases: ['DRIVER LICENCE', 'DRIVER LICENSE', 'DRIVERS LICENCE', 'DRIVERS LICENSE'], weight: 0.45, tier: 'strong', label: 'a driver licence heading' },
      { re: /\b(?:LICEN[CS]E|AUTHORI[SZ]ATION) TO DRIVE\b/, weight: 0.4, tier: 'strong', label: 'an authorisation-to-drive statement' },
      { re: /\b(?:DL|DLN|LICEN[CS]E) (?:NO|NUMBER)\b/, weight: 0.25, tier: 'medium', label: 'a licence number field' },
      { re: /\b(?:LMV|MCWG|MCWOG|HMV|HGMV|MGV|LTV|PSV|TRANS)\b/, weight: 0.22, tier: 'medium', label: 'vehicle class codes such as LMV or MCWG' },
      { re: /\b(?:COV|CLASS OF VEHICLES?|VEHICLE CLASS|CATEGORY OF VEHICLES?|VEHICLES? AUTHORI[SZ]ED)\b/, weight: 0.22, tier: 'medium', label: 'a class-of-vehicle field' },
      { re: /\b[A-Z]{2}[ -]?\d{2}[ -]?\d{11}\b|\b[A-Z]{2}\d{13}\b/, weight: 0.22, tier: 'medium', label: 'a licence number pattern' },
      { re: /\b(?:RTO|REGIONAL TRANSPORT|TRANSPORT (?:DEPARTMENT|AUTHORITY|OFFICE)|LICENSING AUTHORITY|MOTOR VEHICLES?)\b/, weight: 0.2, tier: 'medium', label: 'a transport or licensing authority' },
      { re: /\bVALID (?:TILL|UNTIL|UPTO|UP TO)\b/, weight: 0.12, tier: 'medium', label: 'a validity field' },
      { re: /\bBLOOD GROUP\b|\bBG\b[ :-]*(?:AB|A|B|O)[+-]/, weight: 0.12, tier: 'medium', label: 'a blood group field' },
      { re: /\bS\/D\/W OF\b|\bSON\/DAUGHTER\b/, weight: 0.1, tier: 'medium', label: 'a son, daughter or wife-of field' },
      { re: /\bLICEN[CS]E\b/, weight: 0.05, tier: 'weak', label: 'the word "licence"' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'dateOfBirth', required: true }, { key: 'expiryDate', required: true }, { key: 'dateOfIssue' }, { key: 'address' }, { key: 'vehicleClasses' }, { key: 'bloodGroup' }, { key: 'issuingAuthority' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: false, face: 'required', barcode: true, aspect: 1.585,
    issuer: { label: 'Transport / licensing authority', verification: 'unavailable' }, rules: [dateOrder('dateOfIssue', 'expiryDate')],
    guidance: 'Front side. Ensure licence number and validity are legible.',
  },
  {
    id: 'permit', label: 'Permit / Pass', category: 'travel', legacy: true,
    aliases: ['residence permit', 'border pass', 'work permit'],
    signals: [
      { phrases: ['TRAVEL AUTHORISATION', 'TRAVEL AUTHORIZATION'], weight: 0.5, tier: 'strong', label: 'a travel authorisation heading' },
      { re: /\b(?:BORDER|RESIDENCE|WORK|AREA|ENTRY|MOVEMENT|SPECIAL) (?:PERMIT|PASS)\b/, weight: 0.45, tier: 'strong', label: 'a permit or pass heading' },
      { re: /\bPERMITS?\b/, unless: /\bDRIVING\b|\bDRIVER\b/, weight: 0.4, tier: 'strong', label: 'the word "permit"' },
      { re: /\bPERMIT (?:NO|NUMBER)\b/, weight: 0.25, tier: 'medium', label: 'a permit number field' },
      { re: /\b(?:ISSUING|COMPETENT) (?:AUTHORITY|OFFICER)\b|\bDISTRICT MAGISTRATE\b/, weight: 0.15, tier: 'medium', label: 'an issuing authority field' },
      { re: /\bAUTHORI[SZ]ED (?:TO|AREA|FOR)\b|\bJURISDICTION\b|\bDESTINATION\b|\bAREA OF VALIDITY\b/, weight: 0.15, tier: 'medium', label: 'an authorised area or destination field' },
      { all: [/\bVALID FROM\b/, /\bVALID (?:UNTIL|TILL|TO)\b/], weight: 0.15, tier: 'medium', label: 'a valid-from and valid-until pair' },
      { re: /\bHOLDER\b|\bBEARER\b/, weight: 0.05, tier: 'weak', label: 'holder or bearer wording' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'validUntil', required: true }, { key: 'validFrom' }, { key: 'nationality' }, { key: 'issuingAuthority' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: false, face: 'optional', barcode: true,
    issuer: { label: 'Permit issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Include the permit number, validity dates and any stamps.',
  },
  {
    id: 'pan_card', label: 'PAN Card', category: 'identity',
    aliases: ['permanent account number card', 'pan', 'income tax pan'],
    signals: [
      { phrase: 'PERMANENT ACCOUNT NUMBER', weight: 0.5, tier: 'strong', label: 'a permanent account number heading' },
      { phrases: ['INCOME TAX DEPARTMENT'], weight: 0.45, tier: 'strong', label: 'the Income Tax Department' },
      { re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/, weight: 0.4, tier: 'strong', label: 'a PAN-format account number' },
      { re: /\bPAN\b(?: (?:NO|NUMBER|CARD))?/, weight: 0.2, tier: 'medium', label: 'a PAN field' },
      { all: [/\bFATHERS? NAME\b/, /\bDATE OF BIRTH\b|\bDOB\b/], weight: 0.15, tier: 'medium', label: "a father's name alongside a date of birth" },
      { re: /\bGOVT OF INDIA\b|\bGOVERNMENT OF INDIA\b/, weight: 0.12, tier: 'medium', label: 'a Government of India line' },
      { re: /\bSIGNATURE\b/, weight: 0.02, tier: 'weak', label: 'a signature line' },
    ],
    fields: [{ key: 'fullName', required: true }, { key: 'panNumber', required: true, pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/, hint: '5 letters, 4 digits, 1 letter' }, { key: 'fatherName' }, { key: 'dateOfBirth', required: true }],
    subjectField: 'fullName', primaryIdentifier: 'panNumber', mrz: false, face: 'required', barcode: true, aspect: 1.585,
    issuer: { label: 'Income Tax Department', verification: 'unavailable' },
    rules: [notFuture('dateOfBirth'), plausibleAge('dateOfBirth')],
    guidance: 'Front side with the photograph, account number and date of birth visible.',
  },
  {
    id: 'voter_id', label: 'Voter ID', category: 'identity',
    aliases: ['elector photo identity card', 'epic'],
    signals: [{ re: /\bELECTOR'?S? PHOTO IDENTITY CARD\b/, weight: 0.5, tier: 'strong', label: 'an elector photo identity card heading' }, { re: /\b(?:EPIC|ELECTION COMMISSION|VOTER)\b/, weight: 0.4, tier: 'strong', label: 'an EPIC number or election commission line' }, { re: /\bELECTOR\b/, weight: 0.05, tier: 'weak', label: 'the word "elector"' }],
    fields: [{ key: 'fullName', required: true }, { key: 'epicNumber', required: true, pattern: /^[A-Z]{2,3}[0-9]{6,8}$/, hint: '2–3 letters + 6–8 digits' }, { key: 'fatherName' }, { key: 'dateOfBirth' }, { key: 'gender' }, { key: 'address' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'epicNumber', mrz: false, face: 'required', barcode: true,
    issuer: { label: 'Election authority', verification: 'unavailable' }, rules: [plausibleAge('dateOfBirth', { min: 17 })],
    guidance: 'Front side with photo and elector number.',
  },

  // ------------------------------------------------------------------ civil registration
  {
    id: 'birth_certificate', label: 'Birth Certificate', category: 'civil',
    aliases: ['certificate of birth', 'birth registration'],
    signals: [{ re: /\bBIRTH CERTIFICATE\b|\bCERTIFICATE OF BIRTH\b/, weight: 0.55, tier: 'strong', label: 'a birth certificate heading' }, { re: /\b(?:REGISTRATION OF BIRTHS?|BIRTHS? AND DEATHS?)\b/, weight: 0.2, tier: 'medium', label: 'a births and deaths registration line' }, { re: /\bNAME OF (?:THE )?CHILD\b|\bCHILD'?S? NAME\b/, weight: 0.15, tier: 'medium', label: 'a name-of-child field' }, { re: /\bPLACE OF BIRTH\b/, weight: 0.1, tier: 'medium', label: 'a place of birth field' }, { re: /\bREGISTRAR\b/, weight: 0.05, tier: 'weak', label: 'a registrar line' }],
    fields: [
      { key: 'childName', required: true }, { key: 'dateOfBirth', required: true }, { key: 'placeOfBirth', required: true }, { key: 'gender' },
      { key: 'fatherName' }, { key: 'motherName' }, { key: 'registrationNumber', required: true, pattern: /^[A-Z0-9/-]{4,24}$/ }, { key: 'certificateNumber', pattern: /^[A-Z0-9/-]{4,24}$/ },
      { key: 'registrationDate' }, { key: 'dateOfIssue' }, { key: 'issuingAuthority' }, { key: 'placeOfRegistration' }, { key: 'address' },
    ],
    subjectField: 'childName', primaryIdentifier: 'registrationNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Civil registration authority (Registrar of Births & Deaths)', verification: 'unavailable' },
    rules: [notFuture('dateOfBirth'), plausibleAge('dateOfBirth', { max: 120 }), dateOrder('dateOfBirth', 'registrationDate', { label: 'Registration after birth' }), dateOrder('registrationDate', 'dateOfIssue', { severity: 'minor', label: 'Issued after registration' }), notFuture('registrationDate'), notFuture('dateOfIssue'), nameNotSame('childName', 'fatherName', { severity: 'minor' })],
    guidance: 'Capture the full certificate including the registration number, seal and any QR code.',
  },
  {
    id: 'death_certificate', label: 'Death Certificate', category: 'civil',
    aliases: ['certificate of death', 'death registration'],
    signals: [{ re: /\bDEATH CERTIFICATE\b|\bCERTIFICATE OF DEATH\b/, weight: 0.55, tier: 'strong', label: 'a death certificate heading' }, { re: /\bNAME OF (?:THE )?DECEASED\b|\bDECEASED\b/, weight: 0.2, tier: 'medium', label: 'a name-of-deceased field' }, { re: /\bDATE OF DEATH\b|\bPLACE OF DEATH\b/, weight: 0.2, tier: 'medium', label: 'a date or place of death field' }, { re: /\bREGISTRAR\b/, weight: 0.05, tier: 'weak', label: 'a registrar line' }],
    fields: [
      { key: 'deceasedName', required: true }, { key: 'dateOfDeath', required: true }, { key: 'placeOfDeath', required: true }, { key: 'dateOfBirth' }, { key: 'gender' },
      { key: 'fatherName' }, { key: 'address' }, { key: 'registrationNumber', required: true, pattern: /^[A-Z0-9/-]{4,24}$/ }, { key: 'certificateNumber', pattern: /^[A-Z0-9/-]{4,24}$/ },
      { key: 'registrationDate' }, { key: 'dateOfIssue' }, { key: 'issuingAuthority' }, { key: 'placeOfRegistration' },
    ],
    subjectField: 'deceasedName', primaryIdentifier: 'registrationNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Civil registration authority (Registrar of Births & Deaths)', verification: 'unavailable' },
    rules: [notFuture('dateOfDeath'), notFuture('dateOfBirth'), dateOrder('dateOfBirth', 'dateOfDeath', { severity: 'critical', label: 'Death after birth' }), dateOrder('dateOfDeath', 'registrationDate', { label: 'Registration after death' }), dateOrder('registrationDate', 'dateOfIssue', { severity: 'minor', label: 'Issued after registration' }), plausibleAge('dateOfBirth', { max: 125, at: 'dateOfDeath' })],
    guidance: 'Capture the full certificate including the registration number, seal and any QR code.',
  },

  // ------------------------------------------------------------------ academic
  {
    id: 'marks_memo', label: 'Marks Memo / Marksheet', category: 'academic',
    aliases: ['marks memo', 'marksheet', 'grade card', 'statement of marks', 'semester grade memo', 'consolidated marks'],
    signals: [{ re: /\b(?:MARKS? MEMO|MARKS?SHEET|STATEMENT OF MARKS|GRADE (?:CARD|MEMO|SHEET)|MEMORANDUM OF (?:MARKS|GRADES))\b/, weight: 0.5, tier: 'strong', label: 'a marks memo or marksheet heading' }, { re: /\bSEMESTER\b|\bSEM\b/, weight: 0.15, tier: 'medium', label: 'a semester field' }, { re: /\b(?:SGPA|CGPA|CREDITS?|GRADE POINTS?)\b/, weight: 0.15, tier: 'medium', label: 'grade point or credit fields' }, { re: /\b(?:ROLL|HALL TICKET|H\.?T\.?) NO\b/, weight: 0.1, tier: 'medium', label: 'a roll or hall ticket number' }, { re: /\bTOTAL MARKS\b|\bMARKS OBTAINED\b|\bMAX(?:IMUM)? MARKS\b/, weight: 0.1, tier: 'medium', label: 'marks obtained and maximum marks columns' }],
    fields: [...ACADEMIC_COMMON, { key: 'semester' }, { key: 'subjects' }, { key: 'marks' }, { key: 'totalMarks' }, { key: 'maxMarks' }, { key: 'percentage' }, { key: 'cgpa' }, { key: 'grade' }],
    subjectField: 'studentName', primaryIdentifier: 'rollNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University / examination board', verification: 'unavailable' },
    rules: [marksConsistent(), numericRange('percentage', 0, 100), numericRange('cgpa', 0, 10), notFuture('dateOfIssue'), plausibleAge('dateOfBirth', { min: 10, max: 90 })],
    guidance: 'Capture the whole sheet so the subject table, totals and seal are legible.',
  },
  {
    id: 'degree_certificate', label: 'Degree Certificate', category: 'academic',
    aliases: ['degree', 'provisional certificate', 'diploma certificate', 'convocation certificate'],
    signals: [{ re: /\b(?:DEGREE|DIPLOMA|PROVISIONAL) CERTIFICATE\b/, weight: 0.4, tier: 'strong', label: 'a degree or diploma certificate heading' }, { re: /\b(?:CONFERRED|ADMITTED TO THE DEGREE|HAS BEEN AWARDED|IS AWARDED|CONVOCATION)\b/, weight: 0.3, tier: 'medium', label: 'a degree conferral statement' }, { re: /\bBACHELOR OF\b|\bMASTER OF\b|\bDOCTOR OF\b|\bB\.?TECH\b|\bM\.?TECH\b|\bB\.?SC\b|\bM\.?SC\b|\bMBA\b|\bBBA\b|\bB\.?E\b/, weight: 0.2, tier: 'medium', label: 'a named degree such as Bachelor or Master' }, { re: /\bUNIVERSITY\b/, weight: 0.1, tier: 'medium', label: 'a university line' }],
    fields: [...ACADEMIC_COMMON, { key: 'grade' }, { key: 'cgpa' }],
    subjectField: 'studentName', primaryIdentifier: 'certificateNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), plausibleAge('dateOfBirth', { min: 16, max: 90 }), numericRange('cgpa', 0, 10)],
    guidance: 'Capture the full certificate including seal, signatures and serial number.',
  },
  {
    id: 'transcript', label: 'Academic Transcript', category: 'academic',
    aliases: ['consolidated marks statement', 'transcript of records'],
    signals: [{ re: /\bTRANSCRIPT\b/, weight: 0.5, tier: 'strong', label: 'a transcript heading' }, { re: /\bCONSOLIDATED\b/, weight: 0.2, tier: 'medium', label: 'a consolidated-record line' }, { re: /\b(?:SEMESTER|CGPA|CREDITS?)\b/, weight: 0.2, tier: 'medium', label: 'semester, CGPA or credit fields' }, { re: /\bUNIVERSITY\b/, weight: 0.1, tier: 'medium', label: 'a university line' }],
    fields: [...ACADEMIC_COMMON, { key: 'subjects' }, { key: 'marks' }, { key: 'cgpa' }, { key: 'percentage' }, { key: 'grade' }],
    subjectField: 'studentName', primaryIdentifier: 'rollNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University', verification: 'unavailable' },
    rules: [marksConsistent(), numericRange('percentage', 0, 100), numericRange('cgpa', 0, 10), notFuture('dateOfIssue')],
    guidance: 'Capture each page separately; the totals and seal must be legible.',
  },
  {
    id: 'transfer_certificate', label: 'Transfer / Migration Certificate', category: 'academic',
    aliases: ['transfer certificate', 'migration certificate', 'school leaving certificate', 'tc', 'leaving certificate', 'bonafide certificate', 'study certificate'],
    signals: [{ re: /\b(?:TRANSFER|MIGRATION|SCHOOL LEAVING|LEAVING|BONAFIDE|STUDY|CONDUCT) CERTIFICATE\b/, weight: 0.6, tier: 'strong', label: 'a transfer, migration or leaving certificate heading' }, { re: /\b(?:ADMISSION NO|DATE OF LEAVING|DATE OF ADMISSION|CLASS IN WHICH)\b/, weight: 0.25, tier: 'medium', label: 'admission or leaving date fields' }, { re: /\bSCHOOL\b|\bCOLLEGE\b/, weight: 0.15, tier: 'medium', label: 'a school or college line' }],
    fields: [{ key: 'studentName', required: true }, { key: 'rollNumber' }, { key: 'institution', required: true }, { key: 'dateOfBirth' }, { key: 'fatherName' }, { key: 'course' }, { key: 'academicYear' }, { key: 'dateOfIssue' }, { key: 'certificateNumber' }, { key: 'leavingDate' }],
    subjectField: 'studentName', primaryIdentifier: 'certificateNumber', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'School / college', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), notFuture('leavingDate'), plausibleAge('dateOfBirth', { min: 3, max: 90 })],
    guidance: 'Capture the full certificate including the institution seal and signature.',
  },

  // ------------------------------------------------------------------ employment
  {
    id: 'employment_certificate', label: 'Employment / Experience Certificate', category: 'employment',
    aliases: ['experience certificate', 'service certificate', 'relieving letter', 'employment letter', 'experience letter'],
    signals: [{ re: /\b(?:EXPERIENCE|EMPLOYMENT|SERVICE|RELIEVING|WORK) (?:CERTIFICATE|LETTER)\b/, weight: 0.5, tier: 'strong', label: 'an employment or experience certificate heading' }, { re: /\b(?:WAS EMPLOYED|HAS BEEN WORKING|WORKED WITH|EMPLOYED WITH|IS EMPLOYED|DATE OF JOINING|LAST WORKING DAY)\b/, weight: 0.3, tier: 'medium', label: 'an employment period statement' }, { re: /\bDESIGNATION\b|\bEMPLOYEE (?:ID|NO|CODE)\b/, weight: 0.15, tier: 'medium', label: 'a designation or employee number field' }, { re: /\b(?:PVT|PRIVATE) (?:LTD|LIMITED)\b|\bLLP\b|\bINC\b/, weight: 0.05, tier: 'weak', label: 'a company suffix such as Pvt Ltd' }],
    fields: [{ key: 'employeeName', required: true }, { key: 'employeeId' }, { key: 'organization', required: true }, { key: 'designation', required: true }, { key: 'joiningDate' }, { key: 'leavingDate' }, { key: 'dateOfIssue' }, { key: 'signatory' }, { key: 'companyRegistration' }, { key: 'referenceNumber' }],
    subjectField: 'employeeName', primaryIdentifier: 'employeeId', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'Employer (HR department)', verification: 'unavailable' },
    rules: [dateOrder('joiningDate', 'leavingDate', { label: 'Leaving after joining' }), dateOrder('joiningDate', 'dateOfIssue', { severity: 'minor', label: 'Issued after joining' }), dateOrder('leavingDate', 'dateOfIssue', { severity: 'minor', label: 'Issued on or after leaving', allowEqual: true }), notFuture('dateOfIssue'), notFuture('joiningDate')],
    guidance: 'Capture the whole letter on letterhead including the signature and seal.',
  },
  {
    id: 'salary_certificate', label: 'Salary Certificate / Pay Slip', category: 'employment',
    aliases: ['salary slip', 'pay slip', 'payslip', 'salary statement', 'income certificate'],
    signals: [{ re: /\b(?:SALARY|PAY) (?:CERTIFICATE|SLIP|STATEMENT)\b|\bPAYSLIP\b/, weight: 0.55, tier: 'strong', label: 'a salary certificate or pay slip heading' }, { re: /\b(?:GROSS|NET) (?:SALARY|PAY)\b|\bBASIC PAY\b|\bDEDUCTIONS?\b|\bCTC\b/, weight: 0.3, tier: 'medium', label: 'gross, net or basic pay fields' }, { re: /\bEMPLOYEE (?:ID|NO|CODE)\b/, weight: 0.15, tier: 'medium', label: 'an employee number field' }],
    fields: [{ key: 'employeeName', required: true }, { key: 'employeeId' }, { key: 'organization', required: true }, { key: 'designation' }, { key: 'salary', required: true }, { key: 'dateOfIssue' }, { key: 'signatory' }, { key: 'joiningDate' }],
    subjectField: 'employeeName', primaryIdentifier: 'employeeId', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'Employer (payroll)', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), dateOrder('joiningDate', 'dateOfIssue', { severity: 'minor' })],
    guidance: 'Capture the full statement including the pay period and employer details.',
  },
  {
    id: 'appointment_letter', label: 'Offer / Appointment Letter', category: 'employment',
    aliases: ['offer letter', 'appointment letter', 'joining letter'],
    signals: [{ re: /\b(?:OFFER|APPOINTMENT|JOINING) LETTER\b/, weight: 0.5, tier: 'strong', label: 'an offer or appointment letter heading' }, { re: /\b(?:PLEASED TO (?:OFFER|APPOINT)|OFFER OF EMPLOYMENT|LETTER OF APPOINTMENT|YOUR APPOINTMENT)\b/, weight: 0.35, tier: 'medium', label: 'an offer of employment statement' }, { re: /\bDESIGNATION\b|\bCTC\b|\bDATE OF JOINING\b/, weight: 0.15, tier: 'medium', label: 'a designation, CTC or joining date field' }],
    fields: [{ key: 'employeeName', required: true }, { key: 'organization', required: true }, { key: 'designation', required: true }, { key: 'joiningDate' }, { key: 'salary' }, { key: 'dateOfIssue' }, { key: 'signatory' }, { key: 'referenceNumber' }],
    subjectField: 'employeeName', primaryIdentifier: 'referenceNumber', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'Employer (HR department)', verification: 'unavailable' },
    rules: [dateOrder('dateOfIssue', 'joiningDate', { severity: 'minor', label: 'Joining on or after the letter date', allowEqual: true })],
    guidance: 'Capture every page of the letter; the signature page must be included.',
  },

  // ------------------------------------------------------------------ official / business certificates
  {
    id: 'official_certificate', label: 'Official Certificate', category: 'certificate', generality: 0.6,
    aliases: ['government certificate', 'caste certificate', 'income certificate', 'domicile certificate', 'residence certificate', 'character certificate', 'professional certificate', 'business registration', 'trade licence', 'licence', 'no objection certificate', 'noc'],
    signals: [{ re: /\bCERTIFICATE\b/, weight: 0.3, tier: 'medium', label: 'the word "certificate"' }, { re: /\b(?:THIS IS TO CERTIFY|IT IS CERTIFIED|HEREBY CERTIF(?:Y|IED))\b/, weight: 0.3, tier: 'medium', label: 'a certification statement' }, { re: /\b(?:GOVERNMENT OF|MINISTRY OF|DEPARTMENT OF|OFFICE OF THE|MUNICIPAL|TAHSILDAR|COLLECTOR|DISTRICT MAGISTRATE|REGISTRAR OF COMPANIES)\b/, weight: 0.3, tier: 'medium', label: 'a government office or department line' }, { re: /\bLICEN[CS]E\b/, unless: /\bDRIVING\b|\bDRIVER\b/, weight: 0.2, tier: 'medium', label: 'a licence line' }, { re: /\b(?:SEAL|SIGNATURE|SIGNED|OFFICIAL)\b/, weight: 0.02, tier: 'weak', label: 'a seal, signature or "official" line' }],
    fields: [{ key: 'fullName' }, { key: 'certificateNumber', pattern: /^[A-Z0-9/-]{4,24}$/ }, { key: 'registrationNumber' }, { key: 'referenceNumber' }, { key: 'dateOfIssue' }, { key: 'expiryDate' }, { key: 'issuingAuthority' }, { key: 'fatherName' }, { key: 'address' }, { key: 'organization' }, { key: 'dateOfBirth' }],
    subjectField: 'fullName', primaryIdentifier: 'certificateNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Issuing authority named on the certificate', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), dateOrder('dateOfIssue', 'expiryDate')],
    guidance: 'Capture the full certificate including the issuing authority, seal and any QR code.',
  },
  {
    id: 'financial_document', label: 'Bank / Financial Document', category: 'certificate',
    aliases: ['bank statement', 'invoice', 'receipt', 'tax receipt', 'account statement'],
    signals: [{ re: /\b(?:BANK STATEMENT|ACCOUNT STATEMENT|STATEMENT OF ACCOUNT)\b/, weight: 0.4, tier: 'strong', label: 'a bank or account statement heading' }, { re: /\b(?:INVOICE|RECEIPT|TAX INVOICE|BILL)\b/, weight: 0.35, tier: 'strong', label: 'an invoice, bill or receipt heading' }, { re: /\b(?:IFSC|ACCOUNT NO|A\/C NO|GSTIN|AMOUNT|BALANCE|DEBIT|CREDIT)\b/, weight: 0.25, tier: 'medium', label: 'account, amount or balance fields' }],
    fields: [{ key: 'fullName' }, { key: 'organization' }, { key: 'referenceNumber' }, { key: 'dateOfIssue' }, { key: 'amount' }, { key: 'address' }],
    subjectField: 'fullName', primaryIdentifier: 'referenceNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Issuing institution', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue')],
    guidance: 'Capture the full page including the institution header and reference numbers.',
  },

  // ------------------------------------------------------------------ fallback
  {
    id: 'generic_document', label: 'Unknown / Generic Official Document', category: 'generic',
    aliases: ['other', 'unknown document', 'generic'],
    signals: [],
    fields: [{ key: 'title' }, { key: 'fullName' }, { key: 'issuer' }, { key: 'referenceNumber' }, { key: 'dateOfIssue' }, { key: 'names' }, { key: 'dates' }, { key: 'identifiers' }, { key: 'organizations' }],
    subjectField: 'fullName', primaryIdentifier: 'referenceNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Issuer could not be determined', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue')],
    guidance: 'Capture the whole document; the platform will extract what it can and report what could not be checked.',
  },
];
