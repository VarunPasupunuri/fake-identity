/**
 * DEMO / SYNTHETIC DATA ONLY.
 *
 * Deterministic text fixtures for every document category, used by the mock
 * OCR provider, the mock barcode provider and the unit tests. Every person,
 * institution, number and place here is invented; names carry a DEMO marker
 * and identifiers start with "DEMO-" or use reserved test ranges so they can
 * never be mistaken for real records.
 *
 * Scenarios:
 *   clean               internally consistent document
 *   suspicious          altered document (also drives the mock tampering flags)
 *   missing_fields      required fields absent
 *   inconsistent_dates  contradictory dates
 *   poor_ocr            garbled text / low confidence
 *   unreadable_qr       QR present but not decodable
 *   unknown             text with no recognisable document type
 */
export const SYNTHETIC = true;
export const SCENARIOS = Object.freeze(['clean', 'suspicious', 'missing_fields', 'inconsistent_dates', 'poor_ocr', 'unreadable_qr', 'unknown']);

const garble = (s) => s.replace(/[AEIOU]/g, (c, i) => (i % 3 === 0 ? '#' : c)).replace(/0/g, 'O').replace(/1/g, 'l');

const FIXTURES = {
  birth_certificate: (sc) => {
    const dob = sc === 'inconsistent_dates' ? '2016-05-20' : '2016-05-20';
    const reg = sc === 'inconsistent_dates' ? '2016-05-10' : '2016-06-02';
    return [
      'GOVERNMENT OF DEMOLAND', 'OFFICE OF THE REGISTRAR OF BIRTHS AND DEATHS', 'MUNICIPAL CORPORATION OF SAMPLE CITY',
      'BIRTH CERTIFICATE', '(Issued under the Registration of Births and Deaths Act - DEMO)',
      'This is to certify that the following information has been taken from the original record of birth',
      sc === 'missing_fields' ? '' : 'Name of Child: AARAV DEMO KUMAR',
      'Sex: M', `Date of Birth: ${dob}`, 'Place of Birth: SAMPLE CITY GENERAL HOSPITAL',
      "Father's Name: RAJESH DEMO KUMAR", "Mother's Name: PRIYA DEMO KUMAR", 'Address: 12 TEST LANE, SAMPLE CITY',
      sc === 'missing_fields' ? '' : `Registration No.: ${sc === 'suspicious' ? 'BR-DEMO-2016-0098' : 'BR-DEMO-2016-00417'}`,
      `Date of Registration: ${reg}`, 'Certificate No.: DEMO-BC-771204', 'Date of Issue: 2016-06-05', 'Registrar of Births and Deaths, Sample City',
    ].filter(Boolean).join('\n');
  },
  death_certificate: (sc) => [
    'GOVERNMENT OF DEMOLAND', 'DEPARTMENT OF HEALTH AND FAMILY WELFARE', 'OFFICE OF THE REGISTRAR OF BIRTHS AND DEATHS',
    'DEATH CERTIFICATE',
    'This is to certify that the following information has been taken from the original record of death',
    sc === 'missing_fields' ? '' : 'Name of Deceased: MOHAN DEMO VERMA', 'Sex: M',
    `Date of Birth: ${sc === 'inconsistent_dates' ? '2001-03-14' : '1941-03-14'}`,
    `Date of Death: ${sc === 'inconsistent_dates' ? '1999-11-02' : '2024-11-02'}`, 'Place of Death: SAMPLE CITY GENERAL HOSPITAL',
    "Father's Name: HARI DEMO VERMA", 'Address: 45 TEST ROAD, SAMPLE CITY',
    sc === 'missing_fields' ? '' : `Registration No.: ${sc === 'suspicious' ? 'DR-DEMO-2024-0932' : 'DR-DEMO-2024-01932'}`,
    `Date of Registration: ${sc === 'inconsistent_dates' ? '1999-11-05' : '2024-11-06'}`, 'Certificate No.: DEMO-DC-448120', 'Date of Issue: 2024-11-08',
    'Registrar of Births and Deaths, Sample City',
  ].filter(Boolean).join('\n'),
  marks_memo: (sc) => {
    const rows = sc === 'suspicious'
      ? [['ENGINEERING MATHEMATICS-III', 98, 100, 'A+'], ['DATA STRUCTURES', 62, 100, 'B'], ['DIGITAL LOGIC DESIGN', 71, 100, 'A'], ['COMPUTER ORGANIZATION', 58, 100, 'C'], ['DISCRETE MATHEMATICS', 66, 100, 'B']]
      : [['ENGINEERING MATHEMATICS-III', 78, 100, 'A'], ['DATA STRUCTURES', 62, 100, 'B'], ['DIGITAL LOGIC DESIGN', 71, 100, 'A'], ['COMPUTER ORGANIZATION', 58, 100, 'C'], ['DISCRETE MATHEMATICS', 66, 100, 'B']];
    const total = sc === 'suspicious' ? 335 : rows.reduce((s, r) => s + r[1], 0); // suspicious: printed total left unchanged after a subject mark was raised
    return [
      'DEMO INSTITUTE OF TECHNOLOGY', '(Affiliated to SAMPLE STATE TECHNICAL UNIVERSITY)', 'MEMORANDUM OF MARKS', 'B.TECH II YEAR I SEMESTER REGULAR EXAMINATION',
      sc === 'missing_fields' ? '' : 'Name of Student: NEHA DEMO REDDY', "Father's Name: SURESH DEMO REDDY", sc === 'missing_fields' ? '' : 'Hall Ticket No.: 21DEMO0512', 'Branch: COMPUTER SCIENCE AND ENGINEERING', 'Semester: III', 'Academic Year: 2023-24',
      'SUBJECT MARKS MAX GRADE', ...rows.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[3]}`),
      `TOTAL MARKS ${total}`, 'MAXIMUM MARKS 500', 'SGPA 7.4', 'RESULT PASS', `Date of Issue: ${sc === 'inconsistent_dates' ? '2031-01-15' : '2024-01-15'}`, 'Certificate No.: DEMO-MM-2024-3391', 'Controller of Examinations',
    ].filter(Boolean).join('\n');
  },
  degree_certificate: (sc) => [
    'SAMPLE STATE TECHNICAL UNIVERSITY', 'DEGREE CERTIFICATE',
    sc === 'missing_fields' ? 'This is to certify that the candidate' : 'This is to certify that KARAN DEMO MEHTA',
    'Roll No. 19DEMO0207', 'has been admitted to the degree of BACHELOR OF TECHNOLOGY', 'Branch: ELECTRONICS AND COMMUNICATION ENGINEERING', 'Course: BACHELOR OF TECHNOLOGY',
    'having passed the prescribed examination in FIRST CLASS WITH DISTINCTION', `CGPA ${sc === 'suspicious' ? '11.2' : '8.6'}`, 'Year of Passing: 2023', 'Date of Birth: 2001-08-19',
    `Date of Issue: ${sc === 'inconsistent_dates' ? '2030-04-10' : '2023-08-10'}`, sc === 'missing_fields' ? '' : 'Certificate No.: DEMO-DG-2023-01188', 'Registrar', 'Vice-Chancellor',
  ].filter(Boolean).join('\n'),
  transcript: (sc) => [
    'SAMPLE STATE TECHNICAL UNIVERSITY', 'CONSOLIDATED ACADEMIC TRANSCRIPT', sc === 'missing_fields' ? '' : 'Name of Student: KARAN DEMO MEHTA', sc === 'missing_fields' ? '' : 'Roll No. 19DEMO0207', 'Course: BACHELOR OF TECHNOLOGY', 'Branch: ELECTRONICS AND COMMUNICATION ENGINEERING',
    'SUBJECT MARKS MAX GRADE', 'SIGNALS AND SYSTEMS 74 100 A', 'ANALOG CIRCUITS 69 100 B', 'MICROPROCESSORS 81 100 A', `TOTAL MARKS ${sc === 'suspicious' ? '260' : '224'}`, 'CGPA 8.6', 'Date of Issue: 2023-09-01', 'Certificate No.: DEMO-TR-2023-0442', 'Controller of Examinations',
  ].filter(Boolean).join('\n'),
  transfer_certificate: (sc) => [
    'DEMO PUBLIC SCHOOL, SAMPLE CITY', 'TRANSFER CERTIFICATE', sc === 'missing_fields' ? '' : 'Name of Student: ISHA DEMO NAIR', "Father's Name: ANIL DEMO NAIR", 'Admission No. DEMO-ADM-4471', 'Date of Birth: 2008-12-03', 'Class in which studied: X', 'Date of Leaving: 2024-04-30', 'Date of Issue: 2024-05-06', 'Certificate No.: DEMO-TC-2024-0195', 'Principal',
  ].filter(Boolean).join('\n'),
  employment_certificate: (sc) => [
    'DEMO SOFTWARE SOLUTIONS PRIVATE LIMITED', 'CIN: U72900DL2015PTC000000', 'EXPERIENCE CERTIFICATE', `Ref. No.: DEMO-HR-${sc === 'suspicious' ? '2025-9002' : '2025-0912'}`, 'Date of Issue: 2025-03-31',
    sc === 'missing_fields' ? 'This is to certify that the employee' : 'This is to certify that ROHAN DEMO IYER', 'Employee ID: DEMO-EMP-2210', 'was employed with our organization as a SOFTWARE ENGINEER',
    `Date of Joining: ${sc === 'inconsistent_dates' ? '2025-06-01' : '2021-06-01'}`, 'Date of Leaving: 2025-03-28', 'Designation: SOFTWARE ENGINEER', 'During the tenure the conduct was satisfactory.', 'Authorised Signatory: DEMO HR MANAGER',
  ].filter(Boolean).join('\n'),
  salary_certificate: (sc) => [
    'DEMO SOFTWARE SOLUTIONS PRIVATE LIMITED', 'SALARY CERTIFICATE', 'Date of Issue: 2025-03-31', sc === 'missing_fields' ? '' : 'Employee Name: ROHAN DEMO IYER', 'Employee ID: DEMO-EMP-2210', 'Designation: SOFTWARE ENGINEER', 'Date of Joining: 2021-06-01', `Gross Salary: INR ${sc === 'suspicious' ? '9,50,000' : '95,000'} per month`, 'Net Pay: INR 82,400', 'Authorised Signatory: DEMO PAYROLL OFFICER',
  ].filter(Boolean).join('\n'),
  official_certificate: (sc) => [
    'GOVERNMENT OF DEMOLAND', 'OFFICE OF THE TAHSILDAR, SAMPLE TALUK', 'RESIDENCE CERTIFICATE', 'Certificate No.: DEMO-RC-2025-00731', 'Date of Issue: 2025-02-10', `Valid Until: ${sc === 'suspicious' ? '2025-08-09' : '2028-02-09'}`,
    sc === 'missing_fields' ? 'This is to certify that the applicant' : 'This is to certify that SUNIL DEMO PATEL', "Father's Name: MANOJ DEMO PATEL", 'Address: 7 SAMPLE STREET, SAMPLE TALUK', 'is a resident of Sample Taluk for the last 12 years.', 'Tahsildar, Sample Taluk', 'Seal',
  ].filter(Boolean).join('\n'),
  voter_id: (sc) => ['ELECTION COMMISSION OF DEMOLAND', "ELECTOR'S PHOTO IDENTITY CARD", sc === 'missing_fields' ? '' : 'EPIC No. DEM1234567', 'Name: VIKRAM DEMO SINGH', "Father's Name: AJAY DEMO SINGH", 'Sex: M', `Date of Birth: ${sc === 'inconsistent_dates' ? '2015-01-01' : '1990-01-01'}`, 'Address: 3 TEST AVENUE, SAMPLE CITY'].filter(Boolean).join('\n'),
  generic_document: () => ['SAMPLE CITY WATER SUPPLY AUTHORITY', 'ACKNOWLEDGEMENT OF HANDOVER', 'Ref DEMO-HO-2025-88213', 'Date: 2025-04-02', 'The items listed overleaf were handed over to the bearer LATA DEMO JOSHI', 'Address: 9 TEST GARDENS, SAMPLE CITY', 'Counter 4, Shift B', 'Duty Officer'].join('\n'),
  unknown: () => ['MEMO', 'To whom it may concern', 'The undersigned confirms that the attached items were handed over on 2025-02-03.', 'Ref DEMO-MISC-5567', 'Sincerely', 'DEMO PERSON'].join('\n'),
};

/** Synthetic recognised text for a document type + scenario. Unknown types fall back to the generic fixture. */
export function fixtureText(documentType, scenario = 'clean') {
  if (scenario === 'unknown') return FIXTURES.unknown();
  const fn = FIXTURES[documentType] || FIXTURES.generic_document;
  const text = fn(scenario);
  return scenario === 'poor_ocr' ? garble(text) : text;
}

/** Synthetic decoded QR content for a document type + scenario (undefined when the type carries no code). */
export function fixtureBarcode(documentType, scenario = 'clean') {
  const codes = {
    birth_certificate: { registrationNumber: 'BR-DEMO-2016-00417', name: 'AARAV DEMO KUMAR', dob: '2016-05-20' },
    death_certificate: { registrationNumber: 'DR-DEMO-2024-01932', name: 'MOHAN DEMO VERMA', dod: '2024-11-02' },
    marks_memo: { rollNumber: '21DEMO0512', certificateNumber: 'DEMO-MM-2024-3391', sgpa: 7.4 },
    degree_certificate: { certificateNumber: 'DEMO-DG-2023-01188', rollNumber: '19DEMO0207' },
    transcript: { certificateNumber: 'DEMO-TR-2023-0442', rollNumber: '19DEMO0207' },
    official_certificate: 'https://verify.demoland.example/rc/DEMO-RC-2025-00731',
    national_id: { id: '4471-2209-118', name: 'SUNITA THAPA' },
    driving_license: 'DL MH12 20110012345 RAHUL VERMA',
    voter_id: 'DEM1234567',
    generic_document: 'https://records.samplecity.example/handover/DEMO-HO-2025-88213',
  };
  if (scenario === 'unreadable_qr') return { status: 'unreadable', codes: [], explanation: 'A code-like region was found but could not be decoded (synthetic scenario).' };
  const c = codes[documentType];
  if (!c || scenario === 'unknown' || scenario === 'missing_fields') return { status: 'not_found', codes: [], explanation: 'No QR code or barcode was detected on the document image (synthetic scenario).' };
  const raw = typeof c === 'string' ? c : JSON.stringify(c);
  // Suspicious: the printed identifier was altered, so the code (which still carries the original) no longer agrees.
  return { status: 'detected', codes: [{ format: 'qr_code', rawValue: raw, region: { x: 0.78, y: 0.06, w: 0.16, h: 0.16 } }], explanation: 'QR code decoded (synthetic scenario).' };
}

/** Types the demo selector offers. */
export const DEMO_DOCUMENTS = Object.freeze([
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Visa' },
  { value: 'national_id', label: 'National ID' },
  { value: 'driving_license', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'birth_certificate', label: 'Birth certificate' },
  { value: 'death_certificate', label: 'Death certificate' },
  { value: 'marks_memo', label: 'Semester marks memo' },
  { value: 'degree_certificate', label: 'Degree certificate' },
  { value: 'transcript', label: 'Academic transcript' },
  { value: 'transfer_certificate', label: 'Transfer certificate' },
  { value: 'employment_certificate', label: 'Experience certificate' },
  { value: 'salary_certificate', label: 'Salary certificate' },
  { value: 'official_certificate', label: 'Residence certificate (official)' },
  { value: 'generic_document', label: 'Unrecognised official document' },
]);

export const SCENARIO_OPTIONS = Object.freeze([
  { value: 'clean', label: 'Genuine document' },
  { value: 'suspicious', label: 'Altered document' },
  { value: 'missing_fields', label: 'Missing required fields' },
  { value: 'inconsistent_dates', label: 'Inconsistent dates' },
  { value: 'poor_ocr', label: 'Poor OCR quality' },
  { value: 'unreadable_qr', label: 'Unreadable QR code' },
  { value: 'unknown', label: 'Unknown document type' },
]);
