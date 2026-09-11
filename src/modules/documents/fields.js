/**
 * Universal field catalogue.
 *
 * Every field a document profile may expect is declared once here with its
 * display label, value kind and the printed labels that usually precede it.
 * Extraction, validation and the results UI all read this table, so adding a
 * field is a one-line change.
 *
 * kind: name | date | identifier | text | number | code | gender | list
 */
export const FIELD_KIND = Object.freeze({ NAME: 'name', DATE: 'date', ID: 'identifier', TEXT: 'text', NUMBER: 'number', CODE: 'code', GENDER: 'gender', LIST: 'list' });

/** @type {Record<string, { label: string, kind: string, labels?: string[], pattern?: string }>} */
export const FIELDS = {
  // --- identity (travel / ID documents; kept identical to the legacy extractor) ---
  fullName: { label: 'Full name', kind: 'name', labels: ['FULL NAME', 'NAME OF HOLDER', 'HOLDER NAME', 'NAME'] },
  surname: { label: 'Surname', kind: 'name', labels: ['SURNAME', 'FAMILY NAME', 'LAST NAME'] },
  givenNames: { label: 'Given names', kind: 'name', labels: ['GIVEN NAMES?', 'FIRST NAMES?', 'FORENAMES?'] },
  documentNumber: { label: 'Document number', kind: 'identifier', labels: ['DOCUMENT NO\\.?', 'DOC NO\\.?', 'PASSPORT NO\\.?', 'ID NO\\.?', 'ID NUMBER', 'NUMBER'] },
  nationality: { label: 'Nationality', kind: 'code', labels: ['NATIONALITY', 'CITIZENSHIP'] },
  issuingCountry: { label: 'Issuing country', kind: 'code', labels: ['ISSUING COUNTRY', 'COUNTRY CODE'] },
  dateOfBirth: { label: 'Date of birth', kind: 'date', labels: ['DATE OF BIRTH', 'BIRTH DATE', 'DOB', 'BORN ON', 'BORN'] },
  expiryDate: { label: 'Expiry date', kind: 'date', labels: ['DATE OF EXPIRY', 'EXPIRY DATE', 'EXPIRES?', 'VALID UNTIL', 'VALID TILL', 'VALID TO', 'VALID THRU', 'EXPIRATION'] },
  gender: { label: 'Gender', kind: 'gender', labels: ['SEX', 'GENDER'] },
  visaNumber: { label: 'Visa number', kind: 'identifier', labels: ['VISA NO\\.?', 'VISA NUMBER', 'CONTROL NO\\.?'] },
  visaType: { label: 'Visa type', kind: 'text', labels: ['VISA TYPE', 'TYPE', 'CATEGORY', 'CLASS'] },
  entries: { label: 'Entries', kind: 'text', labels: ['ENTRIES', 'NUMBER OF ENTRIES'] },
  validFrom: { label: 'Valid from', kind: 'date', labels: ['VALID FROM', 'FROM'] },
  validUntil: { label: 'Valid until', kind: 'date', labels: ['VALID UNTIL', 'VALID TILL', 'UNTIL', 'VALID TO'] },
  stayDuration: { label: 'Duration of stay', kind: 'text', labels: ['DURATION OF STAY', 'DURATION', 'PERIOD OF STAY'] },
  optionalData: { label: 'Optional data', kind: 'text' },
  address: { label: 'Address', kind: 'text', labels: ['ADDRESS', 'RESIDENCE', 'PLACE OF RESIDENCE'] },
  placeOfBirth: { label: 'Place of birth', kind: 'text', labels: ['PLACE OF BIRTH', 'BIRTH PLACE', 'BORN AT'] },
  dateOfIssue: { label: 'Date of issue', kind: 'date', labels: ['DATE OF ISSUE', 'ISSUE DATE', 'ISSUED ON', 'ISSUED', 'DATE'] },
  issuingAuthority: { label: 'Issuing authority', kind: 'text', labels: ['ISSUING AUTHORITY', 'ISSUED BY', 'AUTHORITY', 'OFFICE OF (?:THE )?'] },
  vehicleClasses: { label: 'Vehicle classes', kind: 'list', labels: ['VEHICLE CLASS(?:ES)?', 'CLASS OF VEHICLE', 'COV', 'CATEGORIES?'] },
  bloodGroup: { label: 'Blood group', kind: 'text', labels: ['BLOOD GROUP', 'BG'] },
  epicNumber: { label: 'Elector ID number', kind: 'identifier', labels: ['EPIC NO\\.?', 'ELECTOR\'?S? ID', 'ELECTOR ID NO\\.?', 'VOTER ID NO\\.?'] },
  fatherName: { label: "Father's / guardian's name", kind: 'name', labels: ["FATHER'?S? NAME", 'FATHER', "GUARDIAN'?S? NAME", "HUSBAND'?S? NAME", 'S/O', 'D/O', 'W/O'] },
  motherName: { label: "Mother's name", kind: 'name', labels: ["MOTHER'?S? NAME", 'MOTHER'] },

  // --- civil registration ---
  childName: { label: 'Name of child', kind: 'name', labels: ['NAME OF (?:THE )?CHILD', "CHILD'?S? NAME", 'CHILD'] },
  deceasedName: { label: 'Name of deceased', kind: 'name', labels: ['NAME OF (?:THE )?DECEASED', "DECEASED'?S? NAME", 'DECEASED'] },
  dateOfDeath: { label: 'Date of death', kind: 'date', labels: ['DATE OF DEATH', 'DIED ON', 'DEATH DATE'] },
  placeOfDeath: { label: 'Place of death', kind: 'text', labels: ['PLACE OF DEATH', 'DIED AT'] },
  registrationNumber: { label: 'Registration number', kind: 'identifier', labels: ['REGISTRATION NO\\.?', 'REGISTRATION NUMBER', 'REGN?\\.? NO\\.?', 'REG\\.? NO\\.?'] },
  registrationDate: { label: 'Registration date', kind: 'date', labels: ['DATE OF REGISTRATION', 'REGISTRATION DATE', 'REGISTERED ON'] },
  certificateNumber: { label: 'Certificate number', kind: 'identifier', labels: ['CERTIFICATE NO\\.?', 'CERTIFICATE NUMBER', 'CERT\\.? NO\\.?', 'SERIAL NO\\.?', 'SL\\.? NO\\.?'] },
  placeOfRegistration: { label: 'Place of registration', kind: 'text', labels: ['PLACE OF REGISTRATION', 'REGISTRATION UNIT', 'REGISTRATION OFFICE'] },

  // --- academic ---
  studentName: { label: 'Student name', kind: 'name', labels: ['NAME OF (?:THE )?STUDENT', "STUDENT'?S? NAME", 'STUDENT', 'CANDIDATE NAME', 'NAME OF (?:THE )?CANDIDATE', 'THIS IS TO CERTIFY THAT'] },
  rollNumber: { label: 'Roll number', kind: 'identifier', labels: ['ROLL NO\\.?', 'ROLL NUMBER', 'HALL TICKET NO\\.?', 'HT NO\\.?', 'ENROLL?MENT NO\\.?', 'ADMISSION NO\\.?'] },
  institution: { label: 'Institution', kind: 'text', labels: ['INSTITUTION', 'COLLEGE', 'SCHOOL', 'INSTITUTE'] },
  university: { label: 'University / board', kind: 'text', labels: ['UNIVERSITY', 'BOARD'] },
  course: { label: 'Course / programme', kind: 'text', labels: ['COURSE', 'PROGRAMME', 'PROGRAM', 'DEGREE'] },
  branch: { label: 'Branch / specialisation', kind: 'text', labels: ['BRANCH', 'SPECIALI[SZ]ATION', 'DISCIPLINE', 'DEPARTMENT'] },
  semester: { label: 'Semester', kind: 'text', labels: ['SEMESTER', 'SEM\\.?', 'YEAR OF STUDY'] },
  academicYear: { label: 'Academic year', kind: 'text', labels: ['ACADEMIC YEAR', 'SESSION', 'YEAR OF PASSING', 'MONTH & YEAR OF EXAMINATION', 'EXAMINATION HELD IN'] },
  subjects: { label: 'Subjects', kind: 'list' },
  marks: { label: 'Marks', kind: 'list' },
  totalMarks: { label: 'Total marks', kind: 'number', labels: ['TOTAL MARKS', 'TOTAL', 'GRAND TOTAL', 'MARKS OBTAINED'] },
  maxMarks: { label: 'Maximum marks', kind: 'number', labels: ['MAXIMUM MARKS', 'MAX\\.? MARKS', 'OUT OF'] },
  percentage: { label: 'Percentage', kind: 'number', labels: ['PERCENTAGE', 'PERCENT'] },
  cgpa: { label: 'CGPA / SGPA', kind: 'number', labels: ['CGPA', 'SGPA', 'GPA'] },
  grade: { label: 'Grade / division', kind: 'text', labels: ['GRADE', 'DIVISION', 'CLASS AWARDED', 'RESULT'] },

  // --- employment ---
  employeeName: { label: 'Employee name', kind: 'name', labels: ['NAME OF (?:THE )?EMPLOYEE', "EMPLOYEE'?S? NAME", 'EMPLOYEE', 'THIS IS TO CERTIFY THAT'] },
  employeeId: { label: 'Employee ID', kind: 'identifier', labels: ['EMPLOYEE ID', 'EMP\\.? ID', 'EMPLOYEE NO\\.?', 'STAFF NO\\.?', 'EMPLOYEE CODE'] },
  organization: { label: 'Organisation', kind: 'text', labels: ['ORGANI[SZ]ATION', 'COMPANY', 'EMPLOYER', 'FIRM'] },
  designation: { label: 'Designation', kind: 'text', labels: ['DESIGNATION', 'POSITION', 'POST', 'ROLE', 'AS A'] },
  joiningDate: { label: 'Date of joining', kind: 'date', labels: ['DATE OF JOINING', 'JOINING DATE', 'JOINED ON', 'FROM'] },
  leavingDate: { label: 'Date of leaving', kind: 'date', labels: ['DATE OF LEAVING', 'RELIEVING DATE', 'RELIEVED ON', 'LAST WORKING DAY', 'TILL', 'TO'] },
  salary: { label: 'Salary', kind: 'text', labels: ['SALARY', 'GROSS SALARY', 'CTC', 'MONTHLY SALARY', 'ANNUAL SALARY', 'REMUNERATION'] },
  signatory: { label: 'Authorised signatory', kind: 'text', labels: ['AUTHORI[SZ]ED SIGNATORY', 'SIGNATORY', 'SIGNED BY', 'FOR '] },
  companyRegistration: { label: 'Company registration', kind: 'identifier', labels: ['CIN', 'COMPANY REGISTRATION NO\\.?', 'REGISTRATION NO\\.?', 'GSTIN', 'LICENSE NO\\.?', 'LICENCE NO\\.?'] },

  // --- generic ---
  issuer: { label: 'Issuer', kind: 'text', labels: ['ISSUED BY', 'ISSUING AUTHORITY', 'ISSUER', 'AUTHORITY', 'GOVERNMENT OF', 'MINISTRY OF', 'DEPARTMENT OF', 'OFFICE OF (?:THE )?', 'BOARD OF'] },
  referenceNumber: { label: 'Reference number', kind: 'identifier', labels: ['REFERENCE NO\\.?', 'REF\\.? NO\\.?', 'FILE NO\\.?', 'APPLICATION NO\\.?', 'RECEIPT NO\\.?', 'INVOICE NO\\.?', 'ORDER NO\\.?', 'NO\\.?'] },
  title: { label: 'Document title', kind: 'text' },
  dates: { label: 'Dates found', kind: 'list' },
  identifiers: { label: 'Identifiers found', kind: 'list' },
  names: { label: 'Names found', kind: 'list' },
  organizations: { label: 'Organisations found', kind: 'list' },
  amount: { label: 'Amount', kind: 'text', labels: ['AMOUNT', 'TOTAL AMOUNT', 'GRAND TOTAL', 'BALANCE', 'RS\\.?', 'INR', 'USD'] },
};

/** Field key → display label (superset of the legacy validation labels). */
export const UNIVERSAL_FIELD_LABELS = Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, v.label]));

export const DATE_FIELD_KEYS = Object.keys(FIELDS).filter((k) => FIELDS[k].kind === 'date');
export const NAME_FIELD_KEYS = Object.keys(FIELDS).filter((k) => FIELDS[k].kind === 'name');
export const IDENTIFIER_FIELD_KEYS = Object.keys(FIELDS).filter((k) => FIELDS[k].kind === 'identifier');
