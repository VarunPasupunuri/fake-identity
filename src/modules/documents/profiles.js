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
 * @property {{ re: RegExp, weight: number }[]} signals   text signals used by the classifier (weights sum ≈ 1)
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
    signals: [{ re: /\bPASSPORT\b/, weight: 0.5 }, { re: /\bP<[A-Z]{3}/, weight: 0.4 }, { re: /\b(?:REPUBLIC|KINGDOM|UNITED STATES|GOVERNMENT) OF\b/, weight: 0.05 }, { re: /\bNATIONALITY\b/, weight: 0.05 }],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'nationality', required: true }, { key: 'dateOfBirth', required: true }, { key: 'expiryDate', required: true }, { key: 'gender', required: true }, { key: 'surname' }, { key: 'givenNames' }, { key: 'issuingCountry' }, { key: 'placeOfBirth' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: true, face: 'required', barcode: false,
    issuer: { label: 'Passport issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Open to the photo page. Both MRZ lines must be fully visible.',
  },
  {
    id: 'visa', label: 'Visa', category: 'travel', legacy: true,
    aliases: ['entry visa', 'visa sticker'],
    signals: [{ re: /\bVISA\b/, weight: 0.55 }, { re: /\bV<[A-Z]{3}/, weight: 0.25 }, { re: /\b(?:ENTRIES|DURATION OF STAY|VALID FROM)\b/, weight: 0.2 }],
    fields: [{ key: 'fullName', required: true }, { key: 'visaNumber', required: true }, { key: 'nationality', required: true }, { key: 'dateOfBirth', required: true }, { key: 'validUntil', required: true }, { key: 'visaType' }, { key: 'entries' }, { key: 'validFrom' }, { key: 'stayDuration' }],
    subjectField: 'fullName', primaryIdentifier: 'visaNumber', mrz: true, face: 'required', barcode: false,
    issuer: { label: 'Visa issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Include the visa sticker and its MRZ if present.',
  },
  {
    id: 'national_id', label: 'National ID', category: 'identity', legacy: true,
    aliases: ['identity card', 'id card', 'citizenship card', 'aadhaar'],
    signals: [{ re: /\b(?:NATIONAL )?IDENTITY CARD\b/, weight: 0.45 }, { re: /\bI[<D][A-Z]{3}/, weight: 0.2 }, { re: /\bID (?:NO|NUMBER)\b/, weight: 0.2 }, { re: /\b(?:CITIZEN|IDENTITY|AADHAAR|UNIQUE IDENTIFICATION)\b/, weight: 0.15 }],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'dateOfBirth', required: true }, { key: 'gender' }, { key: 'nationality' }, { key: 'address' }, { key: 'expiryDate' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: true, face: 'required', barcode: true,
    issuer: { label: 'National identity authority', verification: 'unavailable' }, rules: [],
    guidance: 'Front side with photo. Flatten the card to avoid glare.',
  },
  {
    id: 'driving_license', label: 'Driving Licence', category: 'identity', legacy: true,
    aliases: ['driving license', 'driver licence', 'dl'],
    signals: [{ re: /\bDRIVING LICEN[CS]E\b/, weight: 0.5 }, { re: /\bDRIVER'?S? LICEN[CS]E\b/, weight: 0.4 }, { re: /\b(?:DL NO|VEHICLE CLASS|COV|LMV|MCWG|TRANSPORT)\b/, weight: 0.1 }],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'dateOfBirth', required: true }, { key: 'expiryDate', required: true }, { key: 'dateOfIssue' }, { key: 'address' }, { key: 'vehicleClasses' }, { key: 'bloodGroup' }, { key: 'issuingAuthority' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: false, face: 'required', barcode: true,
    issuer: { label: 'Transport / licensing authority', verification: 'unavailable' }, rules: [dateOrder('dateOfIssue', 'expiryDate')],
    guidance: 'Front side. Ensure licence number and validity are legible.',
  },
  {
    id: 'permit', label: 'Permit / Pass', category: 'travel', legacy: true,
    aliases: ['residence permit', 'border pass', 'work permit'],
    signals: [{ re: /\bPERMIT\b/, weight: 0.5 }, { re: /\b(?:BORDER|RESIDENCE|WORK|AREA) (?:PERMIT|PASS)\b/, weight: 0.4 }, { re: /\bVALID (?:FROM|UNTIL)\b/, weight: 0.1 }],
    fields: [{ key: 'fullName', required: true }, { key: 'documentNumber', required: true }, { key: 'validUntil', required: true }, { key: 'validFrom' }, { key: 'nationality' }, { key: 'issuingAuthority' }],
    subjectField: 'fullName', primaryIdentifier: 'documentNumber', mrz: false, face: 'optional', barcode: true,
    issuer: { label: 'Permit issuing authority', verification: 'unavailable' }, rules: [],
    guidance: 'Include the permit number, validity dates and any stamps.',
  },
  {
    id: 'voter_id', label: 'Voter ID', category: 'identity',
    aliases: ['elector photo identity card', 'epic'],
    signals: [{ re: /\bELECTOR'?S? PHOTO IDENTITY CARD\b/, weight: 0.5 }, { re: /\b(?:EPIC|ELECTION COMMISSION|VOTER)\b/, weight: 0.4 }, { re: /\bELECTOR\b/, weight: 0.1 }],
    fields: [{ key: 'fullName', required: true }, { key: 'epicNumber', required: true, pattern: /^[A-Z]{2,3}[0-9]{6,8}$/, hint: '2–3 letters + 6–8 digits' }, { key: 'fatherName' }, { key: 'dateOfBirth' }, { key: 'gender' }, { key: 'address' }, { key: 'dateOfIssue' }],
    subjectField: 'fullName', primaryIdentifier: 'epicNumber', mrz: false, face: 'required', barcode: true,
    issuer: { label: 'Election authority', verification: 'unavailable' }, rules: [plausibleAge('dateOfBirth', { min: 17 })],
    guidance: 'Front side with photo and elector number.',
  },

  // ------------------------------------------------------------------ civil registration
  {
    id: 'birth_certificate', label: 'Birth Certificate', category: 'civil',
    aliases: ['certificate of birth', 'birth registration'],
    signals: [{ re: /\bBIRTH CERTIFICATE\b|\bCERTIFICATE OF BIRTH\b/, weight: 0.55 }, { re: /\b(?:REGISTRATION OF BIRTHS?|BIRTHS? AND DEATHS?)\b/, weight: 0.2 }, { re: /\bNAME OF (?:THE )?CHILD\b|\bCHILD'?S? NAME\b/, weight: 0.15 }, { re: /\bPLACE OF BIRTH\b/, weight: 0.05 }, { re: /\bREGISTRAR\b/, weight: 0.05 }],
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
    signals: [{ re: /\bDEATH CERTIFICATE\b|\bCERTIFICATE OF DEATH\b/, weight: 0.55 }, { re: /\bNAME OF (?:THE )?DECEASED\b|\bDECEASED\b/, weight: 0.2 }, { re: /\bDATE OF DEATH\b|\bPLACE OF DEATH\b/, weight: 0.2 }, { re: /\bREGISTRAR\b/, weight: 0.05 }],
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
    signals: [{ re: /\b(?:MARKS? MEMO|MARKS?SHEET|STATEMENT OF MARKS|GRADE (?:CARD|MEMO|SHEET)|MEMORANDUM OF (?:MARKS|GRADES))\b/, weight: 0.5 }, { re: /\bSEMESTER\b|\bSEM\b/, weight: 0.15 }, { re: /\b(?:SGPA|CGPA|CREDITS?|GRADE POINTS?)\b/, weight: 0.15 }, { re: /\b(?:ROLL|HALL TICKET|H\.?T\.?) NO\b/, weight: 0.1 }, { re: /\bTOTAL MARKS\b|\bMARKS OBTAINED\b|\bMAX(?:IMUM)? MARKS\b/, weight: 0.1 }],
    fields: [...ACADEMIC_COMMON, { key: 'semester' }, { key: 'subjects' }, { key: 'marks' }, { key: 'totalMarks' }, { key: 'maxMarks' }, { key: 'percentage' }, { key: 'cgpa' }, { key: 'grade' }],
    subjectField: 'studentName', primaryIdentifier: 'rollNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University / examination board', verification: 'unavailable' },
    rules: [marksConsistent(), numericRange('percentage', 0, 100), numericRange('cgpa', 0, 10), notFuture('dateOfIssue'), plausibleAge('dateOfBirth', { min: 10, max: 90 })],
    guidance: 'Capture the whole sheet so the subject table, totals and seal are legible.',
  },
  {
    id: 'degree_certificate', label: 'Degree Certificate', category: 'academic',
    aliases: ['degree', 'provisional certificate', 'diploma certificate', 'convocation certificate'],
    signals: [{ re: /\b(?:DEGREE|DIPLOMA|PROVISIONAL) CERTIFICATE\b/, weight: 0.4 }, { re: /\b(?:CONFERRED|ADMITTED TO THE DEGREE|HAS BEEN AWARDED|IS AWARDED|CONVOCATION)\b/, weight: 0.3 }, { re: /\bBACHELOR OF\b|\bMASTER OF\b|\bDOCTOR OF\b|\bB\.?TECH\b|\bM\.?TECH\b|\bB\.?SC\b|\bM\.?SC\b|\bMBA\b|\bBBA\b|\bB\.?E\b/, weight: 0.2 }, { re: /\bUNIVERSITY\b/, weight: 0.1 }],
    fields: [...ACADEMIC_COMMON, { key: 'grade' }, { key: 'cgpa' }],
    subjectField: 'studentName', primaryIdentifier: 'certificateNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), plausibleAge('dateOfBirth', { min: 16, max: 90 }), numericRange('cgpa', 0, 10)],
    guidance: 'Capture the full certificate including seal, signatures and serial number.',
  },
  {
    id: 'transcript', label: 'Academic Transcript', category: 'academic',
    aliases: ['consolidated marks statement', 'transcript of records'],
    signals: [{ re: /\bTRANSCRIPT\b/, weight: 0.5 }, { re: /\bCONSOLIDATED\b/, weight: 0.2 }, { re: /\b(?:SEMESTER|CGPA|CREDITS?)\b/, weight: 0.2 }, { re: /\bUNIVERSITY\b/, weight: 0.1 }],
    fields: [...ACADEMIC_COMMON, { key: 'subjects' }, { key: 'marks' }, { key: 'cgpa' }, { key: 'percentage' }, { key: 'grade' }],
    subjectField: 'studentName', primaryIdentifier: 'rollNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'University', verification: 'unavailable' },
    rules: [marksConsistent(), numericRange('percentage', 0, 100), numericRange('cgpa', 0, 10), notFuture('dateOfIssue')],
    guidance: 'Capture each page separately; the totals and seal must be legible.',
  },
  {
    id: 'transfer_certificate', label: 'Transfer / Migration Certificate', category: 'academic',
    aliases: ['transfer certificate', 'migration certificate', 'school leaving certificate', 'tc', 'leaving certificate', 'bonafide certificate', 'study certificate'],
    signals: [{ re: /\b(?:TRANSFER|MIGRATION|SCHOOL LEAVING|LEAVING|BONAFIDE|STUDY|CONDUCT) CERTIFICATE\b/, weight: 0.6 }, { re: /\b(?:ADMISSION NO|DATE OF LEAVING|DATE OF ADMISSION|CLASS IN WHICH)\b/, weight: 0.25 }, { re: /\bSCHOOL\b|\bCOLLEGE\b/, weight: 0.15 }],
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
    signals: [{ re: /\b(?:EXPERIENCE|EMPLOYMENT|SERVICE|RELIEVING|WORK) (?:CERTIFICATE|LETTER)\b/, weight: 0.5 }, { re: /\b(?:WAS EMPLOYED|HAS BEEN WORKING|WORKED WITH|EMPLOYED WITH|IS EMPLOYED|DATE OF JOINING|LAST WORKING DAY)\b/, weight: 0.3 }, { re: /\bDESIGNATION\b|\bEMPLOYEE (?:ID|NO|CODE)\b/, weight: 0.15 }, { re: /\b(?:PVT|PRIVATE) (?:LTD|LIMITED)\b|\bLLP\b|\bINC\b/, weight: 0.05 }],
    fields: [{ key: 'employeeName', required: true }, { key: 'employeeId' }, { key: 'organization', required: true }, { key: 'designation', required: true }, { key: 'joiningDate' }, { key: 'leavingDate' }, { key: 'dateOfIssue' }, { key: 'signatory' }, { key: 'companyRegistration' }, { key: 'referenceNumber' }],
    subjectField: 'employeeName', primaryIdentifier: 'employeeId', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'Employer (HR department)', verification: 'unavailable' },
    rules: [dateOrder('joiningDate', 'leavingDate', { label: 'Leaving after joining' }), dateOrder('joiningDate', 'dateOfIssue', { severity: 'minor', label: 'Issued after joining' }), dateOrder('leavingDate', 'dateOfIssue', { severity: 'minor', label: 'Issued on or after leaving', allowEqual: true }), notFuture('dateOfIssue'), notFuture('joiningDate')],
    guidance: 'Capture the whole letter on letterhead including the signature and seal.',
  },
  {
    id: 'salary_certificate', label: 'Salary Certificate / Pay Slip', category: 'employment',
    aliases: ['salary slip', 'pay slip', 'payslip', 'salary statement', 'income certificate'],
    signals: [{ re: /\b(?:SALARY|PAY) (?:CERTIFICATE|SLIP|STATEMENT)\b|\bPAYSLIP\b/, weight: 0.55 }, { re: /\b(?:GROSS|NET) (?:SALARY|PAY)\b|\bBASIC PAY\b|\bDEDUCTIONS?\b|\bCTC\b/, weight: 0.3 }, { re: /\bEMPLOYEE (?:ID|NO|CODE)\b/, weight: 0.15 }],
    fields: [{ key: 'employeeName', required: true }, { key: 'employeeId' }, { key: 'organization', required: true }, { key: 'designation' }, { key: 'salary', required: true }, { key: 'dateOfIssue' }, { key: 'signatory' }, { key: 'joiningDate' }],
    subjectField: 'employeeName', primaryIdentifier: 'employeeId', mrz: false, face: 'not_applicable', barcode: false,
    issuer: { label: 'Employer (payroll)', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), dateOrder('joiningDate', 'dateOfIssue', { severity: 'minor' })],
    guidance: 'Capture the full statement including the pay period and employer details.',
  },
  {
    id: 'appointment_letter', label: 'Offer / Appointment Letter', category: 'employment',
    aliases: ['offer letter', 'appointment letter', 'joining letter'],
    signals: [{ re: /\b(?:OFFER|APPOINTMENT|JOINING) LETTER\b/, weight: 0.5 }, { re: /\b(?:PLEASED TO (?:OFFER|APPOINT)|OFFER OF EMPLOYMENT|LETTER OF APPOINTMENT|YOUR APPOINTMENT)\b/, weight: 0.35 }, { re: /\bDESIGNATION\b|\bCTC\b|\bDATE OF JOINING\b/, weight: 0.15 }],
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
    signals: [{ re: /\bCERTIFICATE\b/, weight: 0.3 }, { re: /\b(?:THIS IS TO CERTIFY|IT IS CERTIFIED|HEREBY CERTIF(?:Y|IED))\b/, weight: 0.3 }, { re: /\b(?:GOVERNMENT OF|MINISTRY OF|DEPARTMENT OF|OFFICE OF THE|MUNICIPAL|TAHSILDAR|COLLECTOR|DISTRICT MAGISTRATE|REGISTRAR OF COMPANIES|LICEN[CS]E)\b/, weight: 0.3 }, { re: /\b(?:SEAL|SIGNATURE|SIGNED)\b/, weight: 0.1 }],
    fields: [{ key: 'fullName' }, { key: 'certificateNumber', pattern: /^[A-Z0-9/-]{4,24}$/ }, { key: 'registrationNumber' }, { key: 'referenceNumber' }, { key: 'dateOfIssue' }, { key: 'expiryDate' }, { key: 'issuingAuthority' }, { key: 'fatherName' }, { key: 'address' }, { key: 'organization' }, { key: 'dateOfBirth' }],
    subjectField: 'fullName', primaryIdentifier: 'certificateNumber', mrz: false, face: 'not_applicable', barcode: true,
    issuer: { label: 'Issuing authority named on the certificate', verification: 'unavailable' },
    rules: [notFuture('dateOfIssue'), dateOrder('dateOfIssue', 'expiryDate')],
    guidance: 'Capture the full certificate including the issuing authority, seal and any QR code.',
  },
  {
    id: 'financial_document', label: 'Bank / Financial Document', category: 'certificate',
    aliases: ['bank statement', 'invoice', 'receipt', 'tax receipt', 'account statement'],
    signals: [{ re: /\b(?:BANK STATEMENT|ACCOUNT STATEMENT|STATEMENT OF ACCOUNT)\b/, weight: 0.4 }, { re: /\b(?:INVOICE|RECEIPT|TAX INVOICE|BILL)\b/, weight: 0.35 }, { re: /\b(?:IFSC|ACCOUNT NO|A\/C NO|GSTIN|AMOUNT|BALANCE|DEBIT|CREDIT)\b/, weight: 0.25 }],
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
